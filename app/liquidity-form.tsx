"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useFieldArray } from "react-hook-form"
import * as z from "zod"
import { useState, useEffect } from "react"
import { Plus, Trash2, X, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Label } from "@/components/ui/label"
import { ResponsiveSankey } from '@nivo/sankey'
import { Slider } from "@/components/ui/slider"

import { loadFromLocalStorage, saveToLocalStorage } from "@/lib/storage"
import { initialData } from "@/data/initial-data"
import { getClientStore, saveToClientStore, deleteFromClientStore, type SavedClient } from "@/lib/client-store"

// Define the schema for a currency entry
const currencyEntrySchema = z.object({
  currencyCode: z.string().min(1, { message: "Currency is required" }),
  cashAmount: z.coerce.number().min(0, { message: "Cash amount must be a positive number" }),
  cashInterestRate: z.coerce.number().min(0).max(100, { message: "Interest rate must be between 0 and 100" }),
  borrowingAmount: z.coerce.number().min(0, { message: "Borrowing amount must be a positive number" }),
  borrowingInterestRate: z.coerce.number().min(0).max(100, { message: "Interest rate must be between 0 and 100" }),
  borrowingTenor: z.enum(["Short Term", "Long Term"]),
})

// Define the schema for a client entry
const clientEntrySchema = z.object({
  clientName: z.string().min(1, { message: "Client name is required" }),
  operatingCountry: z.string().min(1, { message: "Operating country is required" }),
  currencies: z.array(currencyEntrySchema).min(1, { message: "At least one currency is required" }),
})

// Define the schema for the entire form
const formSchema = z.object({
  entries: z.array(clientEntrySchema).min(1, { message: "At least one client is required" }),
})

type CurrencyEntry = z.infer<typeof currencyEntrySchema>
type ClientEntry = z.infer<typeof clientEntrySchema>

// Summary types
type CurrencySummary = {
  currencyCode: string
  totalCash: number
  totalBorrowing: number
  netPosition: number
}

type CountrySummary = {
  country: string
  currencies: CurrencySummary[]
}

type ClientSummary = {
  clientName: string
  countries: CountrySummary[]
}

// Currency convertibility categories
const currencyConvertibility = {
  "Vietnam": { category: "Restricted Currencies", notes: "Local funds must stay within the country" },
  "India": { category: "Restricted Currencies", notes: "Strict capital controls and repatriation limits" },
  "Malaysia": { category: "Partially Convertible", notes: "Conversion to USD/foreign currency required for repatriation" },
  "Indonesia": { category: "Partially Convertible", notes: "Central bank oversight required for repatriation" },
  "Singapore": { category: "Freely Convertible Currencies", notes: "RTC location, no restrictions" },
  "Hong Kong": { category: "Freely Convertible Currencies", notes: "No material restrictions" },
  "Australia": { category: "Freely Convertible Currencies", notes: "No material restrictions" },
  "China": { category: "Restricted Currencies", notes: "Strict capital controls and SAFE approval required" },
  "Philippines": { category: "Partially Convertible", notes: "Central bank registration required for repatriation" },
  "Thailand": { category: "Partially Convertible", notes: "Bank of Thailand oversight required" },
  "United States": { category: "Freely Convertible Currencies", notes: "Global reserve currency" },
  "United Kingdom": { category: "Freely Convertible Currencies", notes: "No material restrictions" },
  "Japan": { category: "Freely Convertible Currencies", notes: "No material restrictions" },
  "South Korea": { category: "Freely Convertible Currencies", notes: "No material restrictions" },
  "Taiwan": { category: "Partially Convertible", notes: "Central bank oversight required" }
} as const;

type ConvertibilityCategory = "Restricted Currencies" | "Partially Convertible" | "Freely Convertible Currencies";

// Update RTC configuration type
type RTCConfig = {
  location: string;
}

// Add FX rates (simplified example - in practice, these would come from an API)
const fxRates = {
  "USD": { "EUR": 0.92, "SGD": 1.35, "MYR": 4.75, "INR": 83.25 },
  "EUR": { "USD": 1.09, "SGD": 1.47, "MYR": 5.17, "INR": 90.73 },
  "SGD": { "USD": 0.74, "EUR": 0.68, "MYR": 3.52, "INR": 61.67 },
  "MYR": { "USD": 0.21, "EUR": 0.19, "SGD": 0.28, "INR": 17.52 },
  "INR": { "USD": 0.012, "EUR": 0.011, "SGD": 0.016, "MYR": 0.057 }
} as const;

// Add pooling rules type
type PoolingRule = {
  canPool: boolean;
  requiresConversion: boolean;
  targetCurrency?: string;
  conversionPath?: string[];
}

// Pooling configuration based on convertibility
const poolingRules: Record<ConvertibilityCategory, PoolingRule> = {
  "Restricted Currencies": {
    canPool: false,
    requiresConversion: false
  },
  "Partially Convertible": {
    canPool: true,
    requiresConversion: true,
    targetCurrency: "USD",
    conversionPath: ["USD"]
  },
  "Freely Convertible Currencies": {
    canPool: true,
    requiresConversion: false
  }
};

// Update GlobalSummary type
type GlobalSummary = {
  clients: ClientSummary[]
  currencyTotals: {
    [key: string]: {
      totalCash: number
      totalBorrowing: number
      netPosition: number
      cashInterestRate: number
      borrowingInterestRate: number
      borrowingTenor: "Short Term" | "Long Term"
    }
  }
  convertibilityTotals: {
    [key in ConvertibilityCategory]: {
      totalCash: number
      totalBorrowing: number
      netPosition: number
      countries: string[]
    }
  }
  rtcMetrics: {
    potentialUpstreamToRTC: number // From freely convertible
    restrictedFunds: number // From restricted currencies
    pendingConversion: number // From partially convertible
  }
  poolingSimulation: {
    nodes: Array<{
      id: string;
      category: ConvertibilityCategory;
    }>;
    links: Array<{
      source: string;
      target: string;
      value: number;
      convertedValue?: number;
      currency: string;
    }>;
    rtcTotal: number;
  }
}

// Comprehensive ISO currency list
const currencies = [
  { code: "AED", name: "United Arab Emirates Dirham" },
  { code: "AFN", name: "Afghan Afghani" },
  { code: "ALL", name: "Albanian Lek" },
  { code: "AMD", name: "Armenian Dram" },
  { code: "ANG", name: "Netherlands Antillean Guilder" },
  { code: "AOA", name: "Angolan Kwanza" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "AWG", name: "Aruban Florin" },
  { code: "AZN", name: "Azerbaijani Manat" },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark" },
  { code: "BBD", name: "Barbadian Dollar" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "BGN", name: "Bulgarian Lev" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "BIF", name: "Burundian Franc" },
  { code: "BMD", name: "Bermudan Dollar" },
  { code: "BND", name: "Brunei Dollar" },
  { code: "BOB", name: "Bolivian Boliviano" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "BSD", name: "Bahamian Dollar" },
  { code: "BTN", name: "Bhutanese Ngultrum" },
  { code: "BWP", name: "Botswanan Pula" },
  { code: "BYN", name: "Belarusian Ruble" },
  { code: "BZD", name: "Belize Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CDF", name: "Congolese Franc" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CLP", name: "Chilean Peso" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "COP", name: "Colombian Peso" },
  { code: "CRC", name: "Costa Rican Colón" },
  { code: "CUP", name: "Cuban Peso" },
  { code: "CVE", name: "Cape Verdean Escudo" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "DJF", name: "Djiboutian Franc" },
  { code: "DKK", name: "Danish Krone" },
  { code: "DOP", name: "Dominican Peso" },
  { code: "DZD", name: "Algerian Dinar" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "ERN", name: "Eritrean Nakfa" },
  { code: "ETB", name: "Ethiopian Birr" },
  { code: "EUR", name: "Euro" },
  { code: "FJD", name: "Fijian Dollar" },
  { code: "FKP", name: "Falkland Islands Pound" },
  { code: "GBP", name: "British Pound" },
  { code: "GEL", name: "Georgian Lari" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "GIP", name: "Gibraltar Pound" },
  { code: "GMD", name: "Gambian Dalasi" },
  { code: "GNF", name: "Guinean Franc" },
  { code: "GTQ", name: "Guatemalan Quetzal" },
  { code: "GYD", name: "Guyanaese Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "HNL", name: "Honduran Lempira" },
  { code: "HRK", name: "Croatian Kuna" },
  { code: "HTG", name: "Haitian Gourde" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "ILS", name: "Israeli New Shekel" },
  { code: "INR", name: "Indian Rupee" },
  { code: "IQD", name: "Iraqi Dinar" },
  { code: "IRR", name: "Iranian Rial" },
  { code: "ISK", name: "Icelandic Króna" },
  { code: "JMD", name: "Jamaican Dollar" },
  { code: "JOD", name: "Jordanian Dinar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "KGS", name: "Kyrgystani Som" },
  { code: "KHR", name: "Cambodian Riel" },
  { code: "KMF", name: "Comorian Franc" },
  { code: "KPW", name: "North Korean Won" },
  { code: "KRW", name: "South Korean Won" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "KYD", name: "Cayman Islands Dollar" },
  { code: "KZT", name: "Kazakhstani Tenge" },
  { code: "LAK", name: "Laotian Kip" },
  { code: "LBP", name: "Lebanese Pound" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "LRD", name: "Liberian Dollar" },
  { code: "LSL", name: "Lesotho Loti" },
  { code: "LYD", name: "Libyan Dinar" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "MDL", name: "Moldovan Leu" },
  { code: "MGA", name: "Malagasy Ariary" },
  { code: "MKD", name: "Macedonian Denar" },
  { code: "MMK", name: "Myanmar Kyat" },
  { code: "MNT", name: "Mongolian Tugrik" },
  { code: "MOP", name: "Macanese Pataca" },
  { code: "MRU", name: "Mauritanian Ouguiya" },
  { code: "MUR", name: "Mauritian Rupee" },
  { code: "MVR", name: "Maldivian Rufiyaa" },
  { code: "MWK", name: "Malawian Kwacha" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "MZN", name: "Mozambican Metical" },
  { code: "NAD", name: "Namibian Dollar" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "NIO", name: "Nicaraguan Córdoba" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "PAB", name: "Panamanian Balboa" },
  { code: "PEN", name: "Peruvian Sol" },
  { code: "PGK", name: "Papua New Guinean Kina" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "PLN", name: "Polish Złoty" },
  { code: "PYG", name: "Paraguayan Guarani" },
  { code: "QAR", name: "Qatari Rial" },
  { code: "RON", name: "Romanian Leu" },
  { code: "RSD", name: "Serbian Dinar" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "RWF", name: "Rwandan Franc" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "SBD", name: "Solomon Islands Dollar" },
  { code: "SCR", name: "Seychellois Rupee" },
  { code: "SDG", name: "Sudanese Pound" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "SHP", name: "Saint Helena Pound" },
  { code: "SLL", name: "Sierra Leonean Leone" },
  { code: "SOS", name: "Somali Shilling" },
  { code: "SRD", name: "Surinamese Dollar" },
  { code: "SSP", name: "South Sudanese Pound" },
  { code: "STN", name: "São Tomé and Príncipe Dobra" },
  { code: "SYP", name: "Syrian Pound" },
  { code: "SZL", name: "Swazi Lilangeni" },
  { code: "THB", name: "Thai Baht" },
  { code: "TJS", name: "Tajikistani Somoni" },
  { code: "TMT", name: "Turkmenistani Manat" },
  { code: "TND", name: "Tunisian Dinar" },
  { code: "TOP", name: "Tongan Paʻanga" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "TTD", name: "Trinidad and Tobago Dollar" },
  { code: "TWD", name: "New Taiwan Dollar" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "UAH", name: "Ukrainian Hryvnia" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "USD", name: "US Dollar" },
  { code: "UYU", name: "Uruguayan Peso" },
  { code: "UZS", name: "Uzbekistani Som" },
  { code: "VES", name: "Venezuelan Bolívar Soberano" },
  { code: "VND", name: "Vietnamese Đồng" },
  { code: "VUV", name: "Vanuatu Vatu" },
  { code: "WST", name: "Samoan Tala" },
  { code: "XAF", name: "Central African CFA Franc" },
  { code: "XCD", name: "East Caribbean Dollar" },
  { code: "XOF", name: "West African CFA Franc" },
  { code: "XPF", name: "CFP Franc" },
  { code: "YER", name: "Yemeni Rial" },
  { code: "ZAR", name: "South African Rand" },
  { code: "ZMW", name: "Zambian Kwacha" },
  { code: "ZWL", name: "Zimbabwean Dollar" },
]

// Countries grouped by region
const regionCountries = {
  Asia: [
    "China",
    "Hong Kong",
    "India",
    "Indonesia",
    "Japan",
    "Malaysia",
    "Philippines",
    "Singapore",
    "South Korea",
    "Taiwan",
    "Thailand",
    "Vietnam",
  ],
  Europe: [
    "Austria",
    "Belgium",
    "Denmark",
    "Finland",
    "France",
    "Germany",
    "Greece",
    "Ireland",
    "Italy",
    "Netherlands",
    "Norway",
    "Poland",
    "Portugal",
    "Spain",
    "Sweden",
    "Switzerland",
    "United Kingdom",
  ],
  "North America": ["Canada", "Mexico", "United States"],
  "South America": ["Argentina", "Brazil", "Chile", "Colombia", "Peru"],
  Oceania: ["Australia", "New Zealand"],
  Africa: ["Egypt", "Kenya", "Nigeria", "South Africa"],
  "Middle East": ["Israel", "Saudi Arabia", "United Arab Emirates"],
}

// Common currencies by country (simplified example)
const commonCurrenciesByCountry = {
  Singapore: ["SGD", "USD", "EUR", "JPY", "CNY", "HKD", "AUD", "GBP", "MYR", "IDR", "THB"],
  "United States": ["USD", "EUR", "GBP", "JPY", "CAD", "MXN"],
  "United Kingdom": ["GBP", "EUR", "USD"],
  Japan: ["JPY", "USD", "EUR", "CNY"],
  China: ["CNY", "USD", "HKD", "JPY"],
  "Hong Kong": ["HKD", "USD", "CNY", "JPY"],
  Australia: ["AUD", "USD", "JPY", "NZD"],
  Germany: ["EUR", "USD", "GBP", "CHF"],
  France: ["EUR", "USD", "GBP"],
  India: ["INR", "USD", "EUR", "GBP"],
  Indonesia: ["IDR", "USD", "SGD", "JPY"],
  Malaysia: ["MYR", "USD", "SGD", "CNY"],
  // Add more countries as needed
}

// Default for countries not in the list
const defaultCommonCurrencies = ["USD", "EUR", "GBP", "JPY"]

// Format number as currency
const formatCurrency = (amount: number) => {
  if (amount < 0) {
    return `(${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount))})`;
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Export the FormValues type for use in storage.ts
export type FormValues = z.infer<typeof formSchema>

export default function LiquidityForm() {
  const [selectedCurrencies, setSelectedCurrencies] = useState<{ [key: number]: string[] }>({})
  const [currencySelectionOpen, setCurrencySelectionOpen] = useState<{ [key: number]: boolean }>({})
  const [currencySearchTerm, setCurrencySearchTerm] = useState("")
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [clientName, setClientName] = useState("")
  const [savedClients, setSavedClients] = useState<SavedClient[]>([])
  const [summary, setSummary] = useState<GlobalSummary>({
    clients: [],
    currencyTotals: {},
    convertibilityTotals: {
      "Restricted Currencies": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] },
      "Partially Convertible": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] },
      "Freely Convertible Currencies": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] }
    },
    rtcMetrics: {
      potentialUpstreamToRTC: 0,
      restrictedFunds: 0,
      pendingConversion: 0
    },
    poolingSimulation: {
      nodes: [],
      links: [],
      rtcTotal: 0
    }
  })
  const [showSummary, setShowSummary] = useState(false)
  const [rtcConfig, setRTCConfig] = useState<RTCConfig>({
    location: "Singapore"
  });
  const [filters, setFilters] = useState({
    clientName: "",
    country: "_all",
    category: "_all",
    currency: "_all"
  });
  const [fxHaircut, setFxHaircut] = useState(0);
  const [blendedCreditRate, setBlendedCreditRate] = useState(2.5);
  const [usdDebitRate, setUsdDebitRate] = useState(5.0); // Changed default to 5%

  // Load saved clients on mount
  useEffect(() => {
    const store = getClientStore()
    setSavedClients(store.clients)
  }, [])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      entries: [
        {
          clientName: "",
          operatingCountry: "",
          currencies: [
            {
              currencyCode: "",
              cashAmount: 0,
              cashInterestRate: 0,
              borrowingAmount: 0,
              borrowingInterestRate: 0,
              borrowingTenor: "Short Term" as const,
            },
          ],
        },
      ],
    },
  })

  const { control, watch, setValue } = form
  const { fields, append, remove } = useFieldArray({
    name: "entries",
    control,
  })

  // Watch for country changes
  const watchedEntries = watch("entries")

  // Calculate summary whenever form values change, but use a more targeted approach
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (value.entries) {
        calculateSummary(value as FormValues)
      }
    })

    // Initial calculation
    calculateSummary(form.getValues())

    return () => subscription.unsubscribe()
  }, [form])

  // Calculate summary data
  const calculateSummary = (data: FormValues) => {
    if (!data.entries || data.entries.length === 0) {
      setSummary({
        clients: [],
        currencyTotals: {},
        convertibilityTotals: {
          "Restricted Currencies": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] },
          "Partially Convertible": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] },
          "Freely Convertible Currencies": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] }
        },
        rtcMetrics: {
          potentialUpstreamToRTC: 0,
          restrictedFunds: 0,
          pendingConversion: 0
        },
        poolingSimulation: {
          nodes: [],
          links: [],
          rtcTotal: 0
        }
      })
      return
    }

    const newSummary: GlobalSummary = {
      clients: [],
      currencyTotals: {},
      convertibilityTotals: {
        "Restricted Currencies": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] },
        "Partially Convertible": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] },
        "Freely Convertible Currencies": { totalCash: 0, totalBorrowing: 0, netPosition: 0, countries: [] }
      },
      rtcMetrics: {
        potentialUpstreamToRTC: 0,
        restrictedFunds: 0,
        pendingConversion: 0
      },
      poolingSimulation: {
        nodes: [],
        links: [],
        rtcTotal: 0
      }
    }

    // Process each client
    data.entries.forEach((client) => {
      if (!client.clientName || !client.operatingCountry || !client.currencies || client.currencies.length === 0) {
        return
      }

      const clientSummary: ClientSummary = {
        clientName: client.clientName,
        countries: [],
      }

      // Add country data
      const countrySummary: CountrySummary = {
        country: client.operatingCountry,
        currencies: [],
      }

      // Process currencies for this client/country
      client.currencies.forEach((currency) => {
        if (!currency.currencyCode) return

        // Ensure amounts are treated as numbers
        const cashAmount = parseFloat(String(currency.cashAmount)) || 0;
        const borrowingAmount = parseFloat(String(currency.borrowingAmount)) || 0;
        const cashInterestRate = parseFloat(String(currency.cashInterestRate)) || 0;
        const borrowingInterestRate = parseFloat(String(currency.borrowingInterestRate)) || 0;
        const borrowingTenor = currency.borrowingTenor as "Short Term" | "Long Term";

        // Add to country currencies
        countrySummary.currencies.push({
          currencyCode: currency.currencyCode,
          totalCash: cashAmount,
          totalBorrowing: borrowingAmount,
          netPosition: cashAmount - borrowingAmount,
        })

        // Update global currency totals
        if (!newSummary.currencyTotals[currency.currencyCode]) {
          newSummary.currencyTotals[currency.currencyCode] = {
            totalCash: 0,
            totalBorrowing: 0,
            netPosition: 0,
            cashInterestRate: cashInterestRate,
            borrowingInterestRate: borrowingInterestRate,
            borrowingTenor: borrowingTenor,
          }
        } else {
          // Update rates only if they are higher than existing ones
          if (cashInterestRate > newSummary.currencyTotals[currency.currencyCode].cashInterestRate) {
            newSummary.currencyTotals[currency.currencyCode].cashInterestRate = cashInterestRate;
          }
          if (borrowingInterestRate > newSummary.currencyTotals[currency.currencyCode].borrowingInterestRate) {
            newSummary.currencyTotals[currency.currencyCode].borrowingInterestRate = borrowingInterestRate;
          }
        }

        newSummary.currencyTotals[currency.currencyCode].totalCash += cashAmount;
        newSummary.currencyTotals[currency.currencyCode].totalBorrowing += borrowingAmount;
        newSummary.currencyTotals[currency.currencyCode].netPosition += cashAmount - borrowingAmount;
      })

      clientSummary.countries.push(countrySummary)
      newSummary.clients.push(clientSummary)

      // Add country to convertibility category if not already added
      const convertibility = currencyConvertibility[client.operatingCountry as keyof typeof currencyConvertibility];
      if (convertibility) {
        const category = convertibility.category;
        if (!newSummary.convertibilityTotals[category].countries.includes(client.operatingCountry)) {
          newSummary.convertibilityTotals[category].countries.push(client.operatingCountry);
        }
        
        // Add totals to convertibility category
        client.currencies.forEach((currency) => {
          const cashAmount = parseFloat(String(currency.cashAmount)) || 0;
          const borrowingAmount = parseFloat(String(currency.borrowingAmount)) || 0;
          newSummary.convertibilityTotals[category].totalCash += cashAmount;
          newSummary.convertibilityTotals[category].totalBorrowing += borrowingAmount;
          newSummary.convertibilityTotals[category].netPosition += cashAmount - borrowingAmount;
        });
      }
    })

    // Calculate RTC metrics after processing all clients
    newSummary.rtcMetrics = {
      potentialUpstreamToRTC: newSummary.convertibilityTotals["Freely Convertible Currencies"].totalCash,
      restrictedFunds: newSummary.convertibilityTotals["Restricted Currencies"].totalCash,
      pendingConversion: newSummary.convertibilityTotals["Partially Convertible"].totalCash
    }

    // Process each client for pooling simulation
    data.entries.forEach((client) => {
      if (!client.clientName || !client.operatingCountry || !client.currencies?.length) return;

      const countryConvertibility = currencyConvertibility[client.operatingCountry as keyof typeof currencyConvertibility];
      if (!countryConvertibility) return;

      // Add country node if not exists
      const countryNodeId = `${client.operatingCountry}`;
      if (!newSummary.poolingSimulation.nodes.find(n => n.id === countryNodeId)) {
        newSummary.poolingSimulation.nodes.push({
          id: countryNodeId,
          category: countryConvertibility.category
        });
      }

      // Process each currency
      client.currencies.forEach((currency) => {
        // Use cashAmount instead of netPosition for pooling (ignore borrowing)
        const cashAmount = currency.cashAmount;
        if (cashAmount <= 0) return; // Only pool positive cash balances

        const poolingRule = poolingRules[countryConvertibility.category];
        
        if (!poolingRule.canPool) {
          // Add link to show restricted funds
          newSummary.poolingSimulation.links.push({
            source: countryNodeId,
            target: "Restricted",
            value: Math.max(0.1, cashAmount), // Ensure minimum value
            currency: currency.currencyCode
          });
          // Update restricted funds metric
          newSummary.rtcMetrics.restrictedFunds += cashAmount;
        } else if (poolingRule.requiresConversion) {
          // Convert to USD (or specified target currency) before pooling
          const targetCurrency = poolingRule.targetCurrency || "USD";
          const conversionRate = fxRates[currency.currencyCode as keyof typeof fxRates]?.[targetCurrency as keyof typeof fxRates[keyof typeof fxRates]] || 1;
          const convertedValue = cashAmount * conversionRate;

          newSummary.poolingSimulation.links.push({
            source: countryNodeId,
            target: "RTC",
            value: Math.max(0.1, cashAmount), // Ensure minimum value
            convertedValue: Math.max(0.1, convertedValue), // Ensure minimum value
            currency: currency.currencyCode
          });

          // Update pending conversion metric with original amount
          newSummary.rtcMetrics.pendingConversion += cashAmount;
          newSummary.poolingSimulation.rtcTotal += convertedValue;
        } else {
          // Direct pooling for freely convertible currencies
          newSummary.poolingSimulation.links.push({
            source: countryNodeId,
            target: "RTC",
            value: Math.max(0.1, cashAmount), // Ensure minimum value
            currency: currency.currencyCode
          });

          // Update potential upstream metric
          newSummary.rtcMetrics.potentialUpstreamToRTC += cashAmount;
          newSummary.poolingSimulation.rtcTotal += cashAmount;
        }
      });
    });

    // Add RTC and Restricted nodes
    newSummary.poolingSimulation.nodes.push(
      { id: "RTC", category: "Freely Convertible Currencies" },
      { id: "Restricted", category: "Restricted Currencies" }
    );

    setSummary(newSummary)
  }

  // Handle country selection
  const handleCountryChange = (value: string, index: number) => {
    // Update the country in the form
    setValue(`entries.${index}.operatingCountry`, value)

    // Reset currencies for this client
    setValue(`entries.${index}.currencies`, [])

    // Open currency selection for this client
    setCurrencySelectionOpen((prev) => ({ ...prev, [index]: true }))

    // Set suggested currencies based on country
    const suggestedCurrencies =
      commonCurrenciesByCountry[value as keyof typeof commonCurrenciesByCountry] || defaultCommonCurrencies
    setSelectedCurrencies((prev) => ({ ...prev, [index]: [] }))
  }

  // Handle currency selection
  const handleCurrencySelection = (index: number) => {
    if (!selectedCurrencies[index] || selectedCurrencies[index].length === 0) {
      toast({
        title: "No currencies selected",
        description: "Please select at least one currency",
        variant: "destructive",
      })
      return
    }

    // Add selected currencies to the form
    const newCurrencies = selectedCurrencies[index].map((code) => ({
      currencyCode: code,
      cashAmount: 0,
      cashInterestRate: 0,
      borrowingAmount: 0,
      borrowingInterestRate: 0,
      borrowingTenor: "Short Term" as const,
    }))

    setValue(`entries.${index}.currencies`, newCurrencies)

    // Close currency selection
    setCurrencySelectionOpen((prev) => ({ ...prev, [index]: false }))
  }

  // Toggle currency selection
  const toggleCurrency = (currencyCode: string, index: number) => {
    setSelectedCurrencies((prev) => {
      const current = prev[index] || []
      if (current.includes(currencyCode)) {
        return { ...prev, [index]: current.filter((c) => c !== currencyCode) }
      } else {
        return { ...prev, [index]: [...current, currencyCode] }
      }
    })
  }

  // Remove a currency from a client
  const removeCurrency = (clientIndex: number, currencyIndex: number) => {
    const currentCurrencies = form.getValues(`entries.${clientIndex}.currencies`)
    if (currentCurrencies.length > 1) {
      setValue(
        `entries.${clientIndex}.currencies`,
        currentCurrencies.filter((_, i) => i !== currencyIndex),
      )
    } else {
      toast({
        title: "Cannot remove",
        description: "At least one currency is required",
        variant: "destructive",
      })
    }
  }

  // Add another currency to a client
  const addCurrency = (clientIndex: number) => {
    setCurrencySelectionOpen((prev) => ({ ...prev, [clientIndex]: true }))
  }

  // Filter currencies based on search term
  const filteredCurrencies = currencies.filter(
    (currency) =>
      currency.code.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
      currency.name.toLowerCase().includes(currencySearchTerm.toLowerCase()),
  )

  function onSubmit(data: FormValues) {
    // Save to localStorage when form is submitted
    saveToLocalStorage(data)
    
    toast({
      title: "Liquidity data submitted",
      description: (
        <pre className="mt-2 w-full rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    })
    console.log(data)
  }

  const handleSaveClient = () => {
    if (!clientName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a client name",
        variant: "destructive",
      })
      return
    }

    const success = saveToClientStore(clientName, form.getValues())
    if (success) {
      const store = getClientStore()
      setSavedClients(store.clients)
      setSaveDialogOpen(false)
      setClientName("")
      toast({
        title: "Success",
        description: "Client configuration saved successfully",
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to save client configuration",
        variant: "destructive",
      })
    }
  }

  const handleLoadClient = (savedClient: SavedClient) => {
    form.reset(savedClient.data)
    setLoadDialogOpen(false)
    toast({
      title: "Success",
      description: `Loaded configuration for ${savedClient.name}`,
    })
  }

  const handleDeleteClient = (clientName: string) => {
    const success = deleteFromClientStore(clientName)
    if (success) {
      const store = getClientStore()
      setSavedClients(store.clients)
      toast({
        title: "Success",
        description: "Client configuration deleted successfully",
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to delete client configuration",
        variant: "destructive",
      })
    }
  }

  // Add a reset button to clear localStorage
  const handleReset = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('liquidity_data')
      form.reset({
        entries: [
          {
            clientName: "",
            operatingCountry: "",
            currencies: [
              {
                currencyCode: "",
                cashAmount: 0,
                cashInterestRate: 0,
                borrowingAmount: 0,
                borrowingInterestRate: 0,
                borrowingTenor: "Short Term",
              },
            ],
          },
        ],
      })
      toast({
        title: "Form reset",
        description: "All data has been cleared",
      })
    }
  }

  // Add a load sample data button
  const handleLoadSample = () => {
    form.reset(initialData)
    toast({
      title: "Sample data loaded",
      description: "Initial sample data has been loaded into the form",
    })
  }

  // Add Pooling Visualization Component
  const PoolingVisualization = ({ data }: { data: GlobalSummary['poolingSimulation'] }) => {
    const getNodeColor = (category: ConvertibilityCategory | "RTC" | "Restricted") => {
      switch (category) {
        case "Restricted Currencies":
          return "#ef4444";
        case "Partially Convertible":
          return "#eab308";
        default:
          return "#22c55e";
      }
    };

    // Ensure minimum value for visualization
    const MIN_VALUE = 1;
    
    // Calculate total value for normalization
    const totalValue = data.links.reduce((sum, link) => sum + (link.value || 0), 0);
    
    // Normalize and validate values
    const normalizedLinks = data.links.map(link => ({
      source: link.source,
      target: link.target,
      value: totalValue === 0 ? MIN_VALUE : Math.max(MIN_VALUE, link.value || 0),
      label: `${link.currency}\n${formatCurrency(link.value)}${link.convertedValue ? `\n→ ${formatCurrency(link.convertedValue)} USD` : ''}`
    }));

    // Ensure each node has valid links
    const validNodeIds = new Set([
      ...normalizedLinks.map(l => l.source),
      ...normalizedLinks.map(l => l.target)
    ]);

    const sankeyData = {
      nodes: data.nodes
        .filter(node => validNodeIds.has(node.id))
        .map(node => ({
          id: node.id
        })),
      links: normalizedLinks
    };

    // Don't render if no valid data
    if (sankeyData.nodes.length === 0 || sankeyData.links.length === 0) {
      return (
        <div className="w-full h-[500px] border rounded-lg p-4 flex items-center justify-center text-gray-500">
          No data available for visualization
        </div>
      );
    }

    return (
      <div className="w-full h-[500px] border rounded-lg p-4">
        <ResponsiveSankey
          data={sankeyData}
          margin={{ top: 40, right: 160, bottom: 40, left: 50 }}
          align="start"
          colors={(node) => getNodeColor(data.nodes.find(n => n.id === node.id)?.category || "RTC")}
          nodeOpacity={1}
          nodeThickness={20}
          nodeInnerPadding={3}
          nodeSpacing={24}
          nodeBorderWidth={0}
          linkOpacity={0.5}
          linkHoverOthersOpacity={0.1}
          enableLinkGradient={false}
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={16}
          labelTextColor={{
            from: 'color',
            modifiers: [['darker', 1]]
          }}
          nodeBorderRadius={2}
          animate={false}
        />
      </div>
    );
  };

  // Add Pooling Summary Component
  const PoolingSummary = ({ data }: { data: GlobalSummary['poolingSimulation'] }) => {
    // Calculate totals
    const restrictedTotal = data.links
      .filter(link => link.target === "Restricted")
      .reduce((sum, link) => sum + link.value, 0);

    const rtcTotal = data.links
      .filter(link => link.target === "RTC")
      .reduce((sum, link) => sum + (link.convertedValue || link.value), 0);

    const conversionLinks = data.links
      .filter(link => link.convertedValue && link.target === "RTC");

    // Group restricted funds by currency
    const restrictedByCurrency = data.links
      .filter(link => link.target === "Restricted")
      .reduce((acc, link) => {
        acc[link.currency] = (acc[link.currency] || 0) + link.value;
        return acc;
      }, {} as Record<string, number>);

    return (
      <div className="space-y-4 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total Pooled to RTC</CardTitle>
              <CardDescription>After currency conversion</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(rtcTotal)} USD
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Restricted Funds</CardTitle>
              <CardDescription>Cannot be pooled</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(restrictedTotal)} Total
                </div>
                <div className="text-sm space-y-1">
                  {Object.entries(restrictedByCurrency).map(([currency, amount]) => (
                    <div key={currency}>
                      {formatCurrency(amount)} {currency}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Conversion Impact</CardTitle>
              <CardDescription>FX conversion effect</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                {conversionLinks.map(link => (
                  <div key={`${link.source}-${link.target}`} className="font-medium">
                    {formatCurrency(link.value)} {link.currency} →{' '}
                    {formatCurrency(link.convertedValue!)} USD
                  </div>
                ))}
                {conversionLinks.length === 0 && (
                  <div className="text-gray-500">No conversions needed</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Filter the data based on current filters
  const getFilteredData = () => {
    return summary.clients.map(client => ({
      ...client,
      countries: client.countries
        .filter(country => {
          const countryInfo = currencyConvertibility[country.country as keyof typeof currencyConvertibility];
          const matchesCountry = filters.country === "_all" || country.country === filters.country;
          const matchesCategory = filters.category === "_all" || (countryInfo?.category === filters.category);
          
          return matchesCountry && matchesCategory;
        })
        .map(country => ({
          ...country,
          currencies: country.currencies.filter(currency => 
            (filters.currency === "_all" || currency.currencyCode === filters.currency)
          )
        }))
    }))
    .filter(client => {
      const matchesClient = !filters.clientName || client.clientName.toLowerCase().includes(filters.clientName.toLowerCase());
      const hasMatchingData = client.countries.some(country => country.currencies.length > 0);
      return matchesClient && hasMatchingData;
    });
  };

  // Calculate totals for filtered data
  const calculateFilteredTotals = (filteredData: typeof summary.clients) => {
    const totals = {
      totalCash: 0,
      totalBorrowing: 0,
      totalCashInterest: 0,
      totalBorrowingInterest: 0,
      netPosition: 0
    };

    filteredData.forEach(client => {
      client.countries.forEach(country => {
        country.currencies.forEach(currency => {
          const currencyTotals = summary.currencyTotals[currency.currencyCode];
          totals.totalCash += currency.totalCash;
          totals.totalBorrowing += currency.totalBorrowing;
          totals.totalCashInterest += currency.totalCash * (currencyTotals?.cashInterestRate || 0) / 100;
          totals.totalBorrowingInterest += currency.totalBorrowing * (currencyTotals?.borrowingInterestRate || 0) / 100;
          totals.netPosition += currency.netPosition;
        });
      });
    });

    return totals;
  };

  const clearFilters = () => setFilters({
    clientName: "",
    country: "_all",
    category: "_all",
    currency: "_all"
  });

  return (
    <div className="container mx-auto py-10">
      <Card className="w-full mb-8">
        <CardHeader>
          <CardTitle>Regional Treasury Centre (RTC) Configuration</CardTitle>
          <CardDescription>Configure your RTC location for liquidity management.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>RTC Location</Label>
            <Select
              value={rtcConfig.location}
              onValueChange={(value) => setRTCConfig({ location: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select RTC location" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(currencyConvertibility)
                  .filter(([_, info]) => info.category === "Freely Convertible Currencies")
                  .map(([country]) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Your RTC must be in a country with freely convertible currency
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Liquidity Management Form</CardTitle>
              <CardDescription>Enter your client liquidity information below.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                Reset Form
              </Button>
              <Button variant="outline" onClick={handleLoadSample}>
                Load Sample Data
              </Button>
              <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
                Save Configuration
              </Button>
              <Button variant="outline" onClick={() => setLoadDialogOpen(true)}>
                Load Configuration
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Save Dialog */}
        {saveDialogOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-96">
              <h3 className="text-lg font-medium mb-4">Save Configuration</h3>
              <Input
                placeholder="Enter configuration name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mb-4"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveClient}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Load Dialog */}
        {loadDialogOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-[600px]">
              <h3 className="text-lg font-medium mb-4">Load Configuration</h3>
              {savedClients.length === 0 ? (
                <p className="text-center text-gray-500 mb-4">No saved configurations found</p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Saved Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {savedClients.map((client) => (
                        <TableRow key={client.name}>
                          <TableCell>{client.name}</TableCell>
                          <TableCell>{new Date(client.savedAt).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleLoadClient(client)}
                              className="mr-2"
                            >
                              Load
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClient(client.name)}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setLoadDialogOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              {fields.map((field, clientIndex) => (
                <div key={field.id} className="rounded-lg border p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">Client #{clientIndex + 1}</h3>
                    {fields.length > 1 && (
                      <Button type="button" variant="outline" size="icon" onClick={() => remove(clientIndex)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-6 md:grid-cols-2 mb-4">
                    <FormField
                      control={form.control}
                      name={`entries.${clientIndex}.clientName`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter client name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`entries.${clientIndex}.operatingCountry`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Operating Country</FormLabel>
                          <Select
                            onValueChange={(value) => handleCountryChange(value, clientIndex)}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(regionCountries).map(([region, countries]) => (
                                <SelectGroup key={region}>
                                  <SelectLabel>{region}</SelectLabel>
                                  {countries.map((country) => {
                                    const convertibility = currencyConvertibility[country as keyof typeof currencyConvertibility];
                                    return (
                                      <SelectItem key={country} value={country}>
                                        <div className="flex items-center justify-between w-full">
                                          <span>{country}</span>
                                          {convertibility && (
                                            <Badge
                                              variant={
                                                convertibility.category === "Restricted Currencies"
                                                  ? "destructive"
                                                  : convertibility.category === "Partially Convertible"
                                                  ? "secondary"
                                                  : "default"
                                              }
                                              className="ml-2 text-xs"
                                            >
                                              {convertibility.category}
                                            </Badge>
                                          )}
                                        </div>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                          {field.value && currencyConvertibility[field.value as keyof typeof currencyConvertibility]?.notes && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Note: {currencyConvertibility[field.value as keyof typeof currencyConvertibility].notes}
                            </p>
                          )}
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Currency Selection Dialog */}
                  {currencySelectionOpen[clientIndex] && (
                    <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                      <h4 className="font-medium mb-2">
                        Which currencies are applicable for {watchedEntries[clientIndex]?.clientName || "this client"}{" "}
                        in {watchedEntries[clientIndex]?.operatingCountry}?
                      </h4>
                      <p className="text-sm text-gray-500 mb-4">Select all applicable currencies</p>

                      <Tabs defaultValue="suggested" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="suggested">Suggested Currencies</TabsTrigger>
                          <TabsTrigger value="all">All Currencies</TabsTrigger>
                        </TabsList>
                        <TabsContent value="suggested" className="mt-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                            {(
                              commonCurrenciesByCountry[
                                watchedEntries[clientIndex]?.operatingCountry as keyof typeof commonCurrenciesByCountry
                              ] || defaultCommonCurrencies
                            ).map((currencyCode) => {
                              const currency = currencies.find((c) => c.code === currencyCode)
                              return (
                                <div key={currencyCode} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`suggested-${clientIndex}-${currencyCode}`}
                                    checked={(selectedCurrencies[clientIndex] || []).includes(currencyCode)}
                                    onCheckedChange={() => toggleCurrency(currencyCode, clientIndex)}
                                  />
                                  <label
                                    htmlFor={`suggested-${clientIndex}-${currencyCode}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                  >
                                    {currencyCode} - {currency?.name}
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </TabsContent>
                        <TabsContent value="all" className="mt-4">
                          <div className="mb-4 relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search currencies..."
                              className="pl-8"
                              value={currencySearchTerm}
                              onChange={(e) => setCurrencySearchTerm(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4 max-h-60 overflow-y-auto">
                            {filteredCurrencies.map((currency) => (
                              <div key={currency.code} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`all-${clientIndex}-${currency.code}`}
                                  checked={(selectedCurrencies[clientIndex] || []).includes(currency.code)}
                                  onCheckedChange={() => toggleCurrency(currency.code, clientIndex)}
                                />
                                <label
                                  htmlFor={`all-${clientIndex}-${currency.code}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {currency.code} - {currency.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        </TabsContent>
                      </Tabs>

                      <div className="mt-4">
                        <h5 className="text-sm font-medium mb-2">Selected Currencies:</h5>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {(selectedCurrencies[clientIndex] || []).map((code) => {
                            const currency = currencies.find((c) => c.code === code)
                            return (
                              <Badge key={code} variant="secondary" className="px-2 py-1">
                                {code} - {currency?.name}
                              </Badge>
                            )
                          })}
                          {(selectedCurrencies[clientIndex] || []).length === 0 && (
                            <span className="text-sm text-gray-500">No currencies selected</span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button type="button" onClick={() => handleCurrencySelection(clientIndex)}>
                          Confirm Currencies
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Currency Entries */}
                  {!currencySelectionOpen[clientIndex] && watchedEntries[clientIndex]?.currencies?.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">Currency Balances</h4>
                        <Button type="button" variant="outline" size="sm" onClick={() => addCurrency(clientIndex)}>
                          <Plus className="h-4 w-4 mr-1" /> Add Currency
                        </Button>
                      </div>

                      {watchedEntries[clientIndex]?.currencies?.map((currency, currencyIndex) => {
                        const currencyInfo = currencies.find((c) => c.code === currency.currencyCode)
                        return (
                          <div key={currencyIndex} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-center mb-3">
                              <Badge variant="outline" className="px-3 py-1">
                                {currency.currencyCode} - {currencyInfo?.name}
                              </Badge>
                              {watchedEntries[clientIndex]?.currencies?.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeCurrency(clientIndex, currencyIndex)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Cash Section */}
                              <div className="space-y-4 p-4 border rounded-lg">
                                <h5 className="font-medium">Cash Position</h5>
                                <FormField
                                  control={form.control}
                                  name={`entries.${clientIndex}.currencies.${currencyIndex}.cashAmount`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Amount ({currency.currencyCode})</FormLabel>
                                      <FormControl>
                                        <Input type="number" placeholder="0.00" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`entries.${clientIndex}.currencies.${currencyIndex}.cashInterestRate`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Interest Rate (%)</FormLabel>
                                      <FormControl>
                                        <Input type="number" placeholder="0.00" step="0.01" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>

                              {/* Borrowing Section */}
                              <div className="space-y-4 p-4 border rounded-lg">
                                <h5 className="font-medium">Borrowing Position</h5>
                                <FormField
                                  control={form.control}
                                  name={`entries.${clientIndex}.currencies.${currencyIndex}.borrowingAmount`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Amount ({currency.currencyCode})</FormLabel>
                                      <FormControl>
                                        <Input type="number" placeholder="0.00" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`entries.${clientIndex}.currencies.${currencyIndex}.borrowingInterestRate`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Interest Rate (%)</FormLabel>
                                      <FormControl>
                                        <Input type="number" placeholder="0.00" step="0.01" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`entries.${clientIndex}.currencies.${currencyIndex}.borrowingTenor`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Tenor</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select tenor" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="Short Term">Short Term</SelectItem>
                                          <SelectItem value="Long Term">Long Term</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  append({
                    clientName: "",
                    operatingCountry: "",
                    currencies: [],
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Another Client
              </Button>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full">
                Submit Liquidity Data
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {/* Summary Section */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Liquidity Summary</CardTitle>
          <CardDescription>
            Comprehensive overview of liquidity positions across all clients and currencies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.clients.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No data available. Please add client information and submit the form.
            </div>
          ) : (
                <div>
                  <div className="flex items-center gap-4 mb-4">
                    <Input 
                      placeholder="Filter by client name..."
                      value={filters.clientName}
                      onChange={(e) => setFilters(prev => ({ ...prev, clientName: e.target.value }))}
                      className="max-w-xs"
                    />
                    <Select 
                      value={filters.country}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, country: value }))}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">All Countries</SelectItem>
                        {Array.from(new Set(summary.clients.flatMap(client => 
                          client.countries.map(country => country.country)
                        ))).sort().map(country => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select 
                      value={filters.category}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, category: value }))}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">All Categories</SelectItem>
                        <SelectItem value="Restricted Currencies">Restricted</SelectItem>
                        <SelectItem value="Partially Convertible">Partially Convertible</SelectItem>
                        <SelectItem value="Freely Convertible Currencies">Freely Convertible</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select 
                      value={filters.currency}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, currency: value }))}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">All Currencies</SelectItem>
                        {Object.keys(summary.currencyTotals).sort().map(currency => (
                          <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(filters.clientName || filters.country || filters.category || filters.currency) && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={clearFilters}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Cash</TableHead>
                        <TableHead className="text-right">Cash Rate</TableHead>
                        <TableHead className="text-right">Interest Earned</TableHead>
                        <TableHead className="text-right">Borrowing</TableHead>
                        <TableHead className="text-right">Borrowing Rate</TableHead>
                        <TableHead className="text-right">Interest Expense</TableHead>
                    <TableHead className="text-right">Net Interest Earned/(Expense)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                  {getFilteredData().map((client, clientIndex) => (
                        client.countries.map((country) => (
                      country.currencies.map((currency, currencyIndex) => {
                            const countryInfo = currencyConvertibility[country.country as keyof typeof currencyConvertibility];
                            const categoryBadge = countryInfo ? (
                              <Badge
                                variant={
                                  countryInfo.category === "Restricted Currencies"
                                    ? "destructive"
                                    : countryInfo.category === "Partially Convertible"
                                    ? "secondary"
                                    : "default"
                                }
                                className="ml-2"
                              >
                                {countryInfo.category === "Restricted Currencies" ? "RC" :
                                 countryInfo.category === "Partially Convertible" ? "PC" : "FC"}
                              </Badge>
                            ) : null;

                            const totals = summary.currencyTotals[currency.currencyCode];
                        const cashRate = totals?.cashInterestRate || 0;
                        const borrowingRate = totals?.borrowingInterestRate || 0;
                        const interestEarned = currency.totalCash * cashRate / 100;
                        const interestExpense = currency.totalBorrowing * borrowingRate / 100;
                        const netInterest = interestEarned - interestExpense;

                            return (
                          <TableRow key={`${client.clientName}-${country.country}-${currency.currencyCode}-${currencyIndex}`}>
                                <TableCell>{client.clientName}</TableCell>
                                <TableCell>{country.country}</TableCell>
                                <TableCell>{categoryBadge}</TableCell>
                                <TableCell>{currency.currencyCode}</TableCell>
                                <TableCell className="text-right">{formatCurrency(currency.totalCash)}</TableCell>
                            <TableCell className="text-right">{cashRate.toFixed(2)}%</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(interestEarned)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(currency.totalBorrowing)}</TableCell>
                            <TableCell className="text-right">
                              {currency.totalBorrowing > 0 ? `${borrowingRate.toFixed(2)}%` : "-"}
                            </TableCell>
                            <TableCell className="text-right text-red-600">{formatCurrency(borrowingRate > 0 ? -1 * interestExpense : interestExpense)}</TableCell>
                            <TableCell className={`text-right ${netInterest >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatCurrency(netInterest)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ))
                      ))}
                      {/* Grand Total Row */}
                      {(() => {
                        const filteredTotals = calculateFilteredTotals(getFilteredData());
                    const netInterest = filteredTotals.totalCashInterest - filteredTotals.totalBorrowingInterest;
                        return (
                          <TableRow className="bg-muted font-bold">
                            <TableCell colSpan={3}>Grand Total</TableCell>
                            <TableCell>{filters.currency || "All Currencies"}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(filteredTotals.totalCash)}
                            </TableCell>
                            <TableCell className="text-right">-</TableCell>
                            <TableCell className="text-right text-green-600">
                          {formatCurrency(filteredTotals.totalCashInterest)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(filteredTotals.totalBorrowing)}
                            </TableCell>
                            <TableCell className="text-right">-</TableCell>
                            <TableCell className="text-right text-red-600">
                          {formatCurrency(filteredTotals.totalBorrowingInterest > 0 ? -1 * filteredTotals.totalBorrowingInterest : filteredTotals.totalBorrowingInterest)}
                            </TableCell>
                        <TableCell className={`text-right ${netInterest >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(netInterest)}
                            </TableCell>
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>

              {/* RTC View content */}
              <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">Cash Pool Analysis</h3>
                <div className="flex items-center gap-8 mb-4">
                  <div className="flex flex-col gap-2 min-w-[220px]">
                    <Label htmlFor="fxHaircut">FX Haircut (%)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="fxHaircut"
                        min={0}
                        max={100}
                        step={0.1}
                        value={[fxHaircut]}
                        onValueChange={([val]) => setFxHaircut(val)}
                        className="w-40"
                      />
                      <span className="w-12 text-right">{fxHaircut.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[220px]">
                    <Label htmlFor="blendedCreditRate">Blended Credit Rate (%)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="blendedCreditRate"
                        min={0}
                        max={20}
                        step={0.01}
                        value={[blendedCreditRate]}
                        onValueChange={([val]) => setBlendedCreditRate(val)}
                        className="w-40"
                      />
                      <span className="w-12 text-right">{blendedCreditRate.toFixed(2)}%</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[220px]">
                    <Label htmlFor="usdDebitRate">USD Debit Rate (%)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="usdDebitRate"
                        min={0}
                        max={20}
                        step={0.01}
                        value={[usdDebitRate]}
                        onValueChange={([val]) => setUsdDebitRate(val)}
                        className="w-40"
                      />
                      <span className="w-12 text-right">{usdDebitRate.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
                  <div className="overflow-x-auto">
                    <Table className="border-collapse">
                      <TableHeader>
                        <TableRow className="bg-secondary">
                          <TableHead className="border">Category</TableHead>
                        {Array.from(new Set(
                          Object.keys(
                              summary.poolingSimulation.links
                                .filter(link => link.target === "RTC") // Only include poolable currencies
                                .reduce((acc, link) => {
                                  acc[link.currency] = true;
                                  return acc;
                                }, {} as Record<string, boolean>)
                            )
                        )).sort().map((currencyCode: string) => (
                          <TableHead key={currencyCode} className="border text-center">{currencyCode}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Freely Convertible Currencies row */}
                        <TableRow>
                          <TableCell className="border font-medium">
                            <div className="flex items-center">
                              <Badge variant="outline" className="mr-2 bg-green-50">FC</Badge>
                              Freely Convertible
                            </div>
                          </TableCell>
                        {Array.from(new Set(
                          Object.keys(
                              summary.poolingSimulation.links
                                .filter(link => link.target === "RTC") // Only include poolable currencies
                                .reduce((acc, link) => {
                                  acc[link.currency] = true;
                                  return acc;
                                }, {} as Record<string, boolean>)
                            )
                        )).sort().map((currencyCode: string) => {
                            const amount = summary.poolingSimulation.links
                              .filter(link => link.target === "RTC" && !link.convertedValue && link.currency === currencyCode)
                              .reduce((sum, link) => sum + link.value, 0);
                            
                            return (
                              <TableCell key={`fc-${currencyCode}`} className={`border text-right ${amount > 0 ? 'bg-green-50' : ''}`}>
                                {amount > 0 ? formatCurrency(amount) : '-'}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                        
                        {/* Partially Convertible Currencies row */}
                        <TableRow>
                          <TableCell className="border font-medium">
                            <div className="flex items-center">
                              <Badge variant="outline" className="mr-2 bg-yellow-50">PC</Badge>
                              Partially Convertible
                            </div>
                          </TableCell>
                        {Array.from(new Set(
                          Object.keys(
                              summary.poolingSimulation.links
                                .filter(link => link.target === "RTC") // Only include poolable currencies
                                .reduce((acc, link) => {
                                  acc[link.currency] = true;
                                  return acc;
                                }, {} as Record<string, boolean>)
                            )
                        )).sort().map((currencyCode: string) => {
                            const amount = summary.poolingSimulation.links
                              .filter(link => link.target === "RTC" && link.convertedValue && link.currency === currencyCode)
                              .reduce((sum, link) => sum + link.value, 0);
                            
                            return (
                              <TableCell key={`pc-${currencyCode}`} className={`border text-right ${amount > 0 ? 'bg-yellow-50' : ''}`}>
                                {amount > 0 ? formatCurrency(amount) : '-'}
                              </TableCell>
                            );
                          })}
                        </TableRow>

                      {/* Grand Total row with haircut and interest calculations */}
                      <TableRow className="bg-gray-100 font-bold">
                        <TableCell className="border">Grand Total (Poolable Currencies)</TableCell>
                        <TableCell colSpan={Object.keys(summary.currencyTotals).length} className="border">
                          <div className="text-right space-y-1">
                            <div>
                              {formatCurrency(
                                summary.poolingSimulation.links
                                  .filter(link => link.target === "RTC")
                                  .reduce((sum, link) => sum + link.value, 0) * (1 - fxHaircut / 100)
                              )}
                              {fxHaircut > 0 && (
                                <span className="text-sm text-gray-500 ml-2">
                                  (After {fxHaircut}% FX haircut)
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-green-600">
                              Credit Interest: {formatCurrency(
                              summary.poolingSimulation.links
                                  .filter(link => link.target === "RTC")
                                  .reduce((sum, link) => sum + link.value, 0) * (1 - fxHaircut / 100) * (blendedCreditRate / 100)
                              )}/yr @ {blendedCreditRate}%
                            </div>
                            <div className="text-sm text-red-600">
                              Debit Interest: {formatCurrency(
                                summary.poolingSimulation.links
                                  .filter(link => link.target === "RTC")
                                  .reduce((sum, link) => sum + link.value, 0) * (1 - fxHaircut / 100) * (usdDebitRate / 100)
                              )}/yr @ {usdDebitRate}%
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Client Savings Section */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">Client Savings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Interest Expense</CardTitle>
                        <CardDescription>Pre-Pooling</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                          {formatCurrency(
                            -1 * summary.clients.reduce((total, client) => 
                              total + client.countries.reduce((countryTotal, country) =>
                                countryTotal + country.currencies.reduce((currencyTotal, currency) => {
                                  const currencyInfo = summary.currencyTotals[currency.currencyCode];
                                  return currencyTotal + (currency.totalBorrowing * (currencyInfo?.borrowingInterestRate || 0) / 100);
                                }, 0)
                              , 0)
                            , 0)
                          )}/yr
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Interest Expense</CardTitle>
                        <CardDescription>Post-Pooling</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          // Calculate all poolable cash (FC + PC)
                          const poolableLinks = summary.poolingSimulation.links
                            .filter(link => link.target === "RTC");

                          // Step 1: Calculate Pooled Cash (after FX haircut)
                          const totalPooledCash = poolableLinks
                            .reduce((sum, link) => sum + link.value, 0) * (1 - fxHaircut / 100);

                          // Step 2: Calculate Total Borrowing (excluding restricted)
                          const totalBorrowing = summary.clients.reduce((total, client) => 
                            total + client.countries.reduce((countryTotal, country) => {
                              const countryInfo = currencyConvertibility[country.country as keyof typeof currencyConvertibility];
                              if (countryInfo?.category === "Restricted Currencies") {
                                return countryTotal;
                              }
                              return countryTotal + country.currencies.reduce((currencyTotal, currency) => 
                                currencyTotal + currency.totalBorrowing
                              , 0);
                            }, 0)
                          , 0);

                          // Step 3: Calculate Net Position
                          const netPosition = totalPooledCash - totalBorrowing;

                          // Step 4: Calculate Interest Expenses
                          const cashPoolBorrowingCost = totalPooledCash * (usdDebitRate / 100);
                          const additionalBorrowingCost = netPosition < 0 ? Math.abs(netPosition) * (usdDebitRate / 100) : 0;
                          const totalExpense = cashPoolBorrowingCost + additionalBorrowingCost;

                          return (
                            <div className="text-2xl font-bold text-red-600">
                              {formatCurrency(-1 * totalExpense)}/yr
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Net Savings</CardTitle>
                        <CardDescription>Annual Interest Savings</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          // Calculate current (pre-pooling) expense
                          const currentExpense = summary.clients.reduce((total, client) => 
                            total + client.countries.reduce((countryTotal, country) =>
                              countryTotal + country.currencies.reduce((currencyTotal, currency) => {
                                const currencyInfo = summary.currencyTotals[currency.currencyCode];
                                return currencyTotal + (currency.totalBorrowing * (currencyInfo?.borrowingInterestRate || 0) / 100);
                              }, 0)
                            , 0)
                          , 0);

                          // Calculate post-pooling expense
                          const poolableLinks = summary.poolingSimulation.links
                            .filter(link => link.target === "RTC");
                          const totalPooledCash = poolableLinks
                            .reduce((sum, link) => sum + link.value, 0) * (1 - fxHaircut / 100);
                          const totalBorrowing = summary.clients.reduce((total, client) => 
                            total + client.countries.reduce((countryTotal, country) => {
                              const countryInfo = currencyConvertibility[country.country as keyof typeof currencyConvertibility];
                              if (countryInfo?.category === "Restricted Currencies") {
                                return countryTotal;
                              }
                              return countryTotal + country.currencies.reduce((currencyTotal, currency) => 
                                currencyTotal + currency.totalBorrowing
                              , 0);
                            }, 0)
                          , 0);
                          const netPosition = totalPooledCash - totalBorrowing;
                          const cashPoolBorrowingCost = totalPooledCash * (usdDebitRate / 100);
                          const additionalBorrowingCost = netPosition < 0 ? Math.abs(netPosition) * (usdDebitRate / 100) : 0;
                          const postPoolingExpense = cashPoolBorrowingCost + additionalBorrowingCost;

                          // Calculate savings
                          const netSavings = currentExpense - postPoolingExpense;
                          const savingsPercentage = currentExpense > 0 ? (netSavings / currentExpense * 100) : 0;

                          return (
                            <>
                              <div className={`text-2xl font-bold ${netSavings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(Math.abs(netSavings))}/yr
                              </div>
                              <div className="text-sm text-gray-500">
                                {netSavings >= 0 ? 'Savings' : 'Additional Cost'} of {Math.abs(savingsPercentage).toFixed(1)}%
                              </div>
                            </>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
