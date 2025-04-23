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

// Define the schema for a currency entry
const currencyEntrySchema = z.object({
  currencyCode: z.string().min(1, { message: "Currency is required" }),
  cashAmount: z.coerce.number().min(0, { message: "Cash amount must be a positive number" }),
  cashInterestRate: z.coerce.number().min(0).max(100, { message: "Interest rate must be between 0 and 100" }),
  borrowingAmount: z.coerce.number().min(0, { message: "Borrowing amount must be a positive number" }),
  borrowingInterestRate: z.coerce.number().min(0).max(100, { message: "Interest rate must be between 0 and 100" }),
  borrowingTenor: z.enum(["Short Term", "Long Term"]),
})

// Define the schema for a single client entry
const clientEntrySchema = z.object({
  clientName: z.string().min(1, { message: "Client name is required" }),
  operatingCountry: z.string().min(1, { message: "Operating country is required" }),
  currencies: z.array(currencyEntrySchema).min(1, { message: "At least one currency is required" }),
})

// Define the schema for the entire form
const formSchema = z.object({
  entries: z.array(clientEntrySchema).min(1, { message: "At least one client entry is required" }),
})

type CurrencyEntry = z.infer<typeof currencyEntrySchema>
type ClientEntry = z.infer<typeof clientEntrySchema>
type FormValues = z.infer<typeof formSchema>

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
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function LiquidityForm() {
  const [selectedCurrencies, setSelectedCurrencies] = useState<{ [key: number]: string[] }>({})
  const [currencySelectionOpen, setCurrencySelectionOpen] = useState<{ [key: number]: boolean }>({})
  const [currencySearchTerm, setCurrencySearchTerm] = useState("")
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
              borrowingTenor: "Short Term",
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
            cashInterestRate: 0,
            borrowingInterestRate: 0,
            borrowingTenor: "Short Term",
          }
        }

        newSummary.currencyTotals[currency.currencyCode].totalCash += cashAmount
        newSummary.currencyTotals[currency.currencyCode].totalBorrowing += borrowingAmount
        newSummary.currencyTotals[currency.currencyCode].netPosition += cashAmount - borrowingAmount
        newSummary.currencyTotals[currency.currencyCode].cashInterestRate = cashInterestRate
        newSummary.currencyTotals[currency.currencyCode].borrowingInterestRate = borrowingInterestRate
        newSummary.currencyTotals[currency.currencyCode].borrowingTenor = borrowingTenor
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
      potentialUpstreamToRTC: newSummary.convertibilityTotals["Freely Convertible Currencies"].netPosition,
      restrictedFunds: newSummary.convertibilityTotals["Restricted Currencies"].netPosition,
      pendingConversion: newSummary.convertibilityTotals["Partially Convertible"].netPosition
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
        const netPosition = currency.cashAmount - currency.borrowingAmount;
        if (netPosition <= 0) return; // Only pool positive balances

        const poolingRule = poolingRules[countryConvertibility.category];
        
        if (!poolingRule.canPool) {
          // Add link to show restricted funds
          newSummary.poolingSimulation.links.push({
            source: countryNodeId,
            target: "Restricted",
            value: Math.max(0.1, netPosition), // Ensure minimum value
            currency: currency.currencyCode
          });
          // Update restricted funds metric
          newSummary.rtcMetrics.restrictedFunds += netPosition;
        } else if (poolingRule.requiresConversion) {
          // Convert to USD (or specified target currency) before pooling
          const targetCurrency = poolingRule.targetCurrency || "USD";
          const conversionRate = fxRates[currency.currencyCode as keyof typeof fxRates]?.[targetCurrency as keyof typeof fxRates[keyof typeof fxRates]] || 1;
          const convertedValue = netPosition * conversionRate;

          newSummary.poolingSimulation.links.push({
            source: countryNodeId,
            target: "RTC",
            value: Math.max(0.1, netPosition), // Ensure minimum value
            convertedValue: Math.max(0.1, convertedValue), // Ensure minimum value
            currency: currency.currencyCode
          });

          // Update pending conversion metric with original amount
          newSummary.rtcMetrics.pendingConversion += netPosition;
          newSummary.poolingSimulation.rtcTotal += convertedValue;
        } else {
          // Direct pooling for freely convertible currencies
          newSummary.poolingSimulation.links.push({
            source: countryNodeId,
            target: "RTC",
            value: Math.max(0.1, netPosition), // Ensure minimum value
            currency: currency.currencyCode
          });

          // Update potential upstream metric
          newSummary.rtcMetrics.potentialUpstreamToRTC += netPosition;
          newSummary.poolingSimulation.rtcTotal += netPosition;
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
    toast({
      title: "Liquidity data submitted",
      description: (
        <pre className="mt-2 w-full rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    })
    console.log(data)
    // We don't need to set showSummary since the summary is always visible
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
          <CardTitle>Client Liquidity Form</CardTitle>
          <CardDescription>
            Enter cash and borrowing amounts by client, operating country, and currency.
          </CardDescription>
        </CardHeader>
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
            <Tabs defaultValue="overall" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="overall">Overall Summary</TabsTrigger>
                <TabsTrigger value="clients">Client-wise Breakdown</TabsTrigger>
                <TabsTrigger value="rtc">RTC View</TabsTrigger>
              </TabsList>

              {/* Overall Summary Tab */}
              <TabsContent value="overall" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Total Assets</CardTitle>
                      <CardDescription>Aggregated cash positions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(
                          Object.values(summary.currencyTotals).reduce((sum, curr) => sum + curr.totalCash, 0),
                        )}
                      </div>
                      <div className="text-sm text-green-600 mt-2">
                        Interest Earned: {formatCurrency(
                          Object.values(summary.currencyTotals).reduce(
                            (sum, curr) => sum + (curr.totalCash * curr.cashInterestRate / 100), 
                            0
                          ),
                        )}/yr
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Total Liabilities</CardTitle>
                      <CardDescription>Aggregated borrowing positions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(
                          Object.values(summary.currencyTotals).reduce((sum, curr) => sum + curr.totalBorrowing, 0),
                        )}
                      </div>
                      <div className="text-sm text-red-600 mt-2">
                        Interest Expense: {formatCurrency(
                          Object.values(summary.currencyTotals).reduce(
                            (sum, curr) => sum + (curr.totalBorrowing * curr.borrowingInterestRate / 100),
                            0
                          ),
                        )}/yr
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Net Liquidity</CardTitle>
                      <CardDescription>Overall liquidity position</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const netPosition = Object.values(summary.currencyTotals).reduce(
                          (sum, curr) => sum + curr.netPosition,
                          0,
                        )
                        const netInterest = Object.values(summary.currencyTotals).reduce(
                          (sum, curr) => 
                            sum + 
                            (curr.totalCash * curr.cashInterestRate / 100) - 
                            (curr.totalBorrowing * curr.borrowingInterestRate / 100),
                          0,
                        )
                        return (
                          <>
                            <div className={`text-2xl font-bold ${netPosition >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatCurrency(netPosition)}
                            </div>
                            <div className={`text-sm mt-2 ${netInterest >= 0 ? "text-green-600" : "text-red-600"}`}>
                              Net Interest: {formatCurrency(netInterest)}/yr
                            </div>
                          </>
                        )
                      })()}
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-4">Currency Breakdown</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Total Cash</TableHead>
                        <TableHead className="text-right">Cash Rate</TableHead>
                        <TableHead className="text-right">Interest Earned</TableHead>
                        <TableHead className="text-right">Total Borrowing</TableHead>
                        <TableHead className="text-right">Borrowing Rate</TableHead>
                        <TableHead className="text-right">Interest Expense</TableHead>
                        <TableHead className="text-right">Tenor</TableHead>
                        <TableHead className="text-right">Net Position</TableHead>
                        <TableHead className="text-right">Net Interest</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(summary.currencyTotals)
                        .sort(([, a], [, b]) => Math.abs(b.netPosition) - Math.abs(a.netPosition))
                        .map(([currencyCode, totals], index) => {
                          const totalNetPosition = Object.values(summary.currencyTotals).reduce(
                            (sum, curr) => sum + Math.abs(curr.netPosition),
                            0,
                          )
                          const percentage =
                            totalNetPosition === 0 ? 0 : (Math.abs(totals.netPosition) / totalNetPosition) * 100
                          
                          const interestEarned = totals.totalCash * totals.cashInterestRate / 100
                          const interestExpense = totals.totalBorrowing * totals.borrowingInterestRate / 100
                          const netInterest = interestEarned - interestExpense

                          return (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{currencyCode}</TableCell>
                              <TableCell className="text-right">{formatCurrency(totals.totalCash)}</TableCell>
                              <TableCell className="text-right">{totals.cashInterestRate.toFixed(2)}%</TableCell>
                              <TableCell className="text-right text-green-600">{formatCurrency(interestEarned)}/yr</TableCell>
                              <TableCell className="text-right">{formatCurrency(totals.totalBorrowing)}</TableCell>
                              <TableCell className="text-right">{totals.borrowingInterestRate.toFixed(2)}%</TableCell>
                              <TableCell className="text-right text-red-600">{formatCurrency(interestExpense)}/yr</TableCell>
                              <TableCell className="text-right">{totals.borrowingTenor}</TableCell>
                              <TableCell
                                className={`text-right ${totals.netPosition >= 0 ? "text-green-600" : "text-red-600"}`}
                              >
                                {formatCurrency(totals.netPosition)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${netInterest >= 0 ? "text-green-600" : "text-red-600"}`}
                              >
                                {formatCurrency(netInterest)}/yr
                              </TableCell>
                              <TableCell className="text-right">{percentage.toFixed(1)}%</TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>

                {/* Add Convertibility Breakdown after Currency Breakdown */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">Convertibility Breakdown</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Countries</TableHead>
                        <TableHead className="text-right">Total Cash</TableHead>
                        <TableHead className="text-right">Total Borrowing</TableHead>
                        <TableHead className="text-right">Net Position</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Object.entries(summary.convertibilityTotals) as [ConvertibilityCategory, typeof summary.convertibilityTotals[ConvertibilityCategory]][]).map(([category, totals]) => {
                        const totalNetPosition = Object.values(summary.convertibilityTotals).reduce(
                          (sum, curr) => sum + Math.abs(curr.netPosition),
                          0
                        );
                        const percentage = totalNetPosition === 0 ? 0 : (Math.abs(totals.netPosition) / totalNetPosition) * 100;

                        return (
                          <TableRow key={category}>
                            <TableCell className="font-medium">
                              <div>
                                {category}
                                <Badge
                                  variant={
                                    category === "Restricted Currencies"
                                      ? "destructive"
                                      : category === "Partially Convertible"
                                      ? "secondary"
                                      : "default"
                                  }
                                  className="ml-2"
                                >
                                  {totals.countries.length} countries
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>{totals.countries.join(", ")}</TableCell>
                            <TableCell className="text-right">{formatCurrency(totals.totalCash)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(totals.totalBorrowing)}</TableCell>
                            <TableCell
                              className={`text-right ${totals.netPosition >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {formatCurrency(totals.netPosition)}
                            </TableCell>
                            <TableCell className="text-right">{percentage.toFixed(1)}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Client-wise Breakdown Tab */}
              <TabsContent value="clients">
                <div className="space-y-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Operating Country</TableHead>
                        <TableHead className="text-right">Total Assets</TableHead>
                        <TableHead className="text-right">Total Liabilities</TableHead>
                        <TableHead className="text-right">Net Position</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.clients.map((client, index) => {
                        // Calculate totals for this client
                        const clientTotals = {
                          assets: 0,
                          liabilities: 0,
                          netPosition: 0,
                        }

                        client.countries.forEach((country) => {
                          country.currencies.forEach((currency) => {
                            clientTotals.assets += currency.totalCash
                            clientTotals.liabilities += currency.totalBorrowing
                            clientTotals.netPosition += currency.netPosition
                          })
                        })

                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{client.clientName}</TableCell>
                            <TableCell>{client.countries.map((country) => country.country).join(", ")}</TableCell>
                            <TableCell className="text-right">{formatCurrency(clientTotals.assets)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(clientTotals.liabilities)}</TableCell>
                            <TableCell
                              className={`text-right ${clientTotals.netPosition >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {formatCurrency(clientTotals.netPosition)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>

                  <h3 className="text-lg font-medium mt-8 mb-4">Detailed Client Breakdown</h3>
                  <Accordion type="single" collapsible className="w-full">
                    {summary.clients.map((client, clientIndex) => {
                      // Calculate client totals
                      const clientTotals = {
                        assets: 0,
                        liabilities: 0,
                        netPosition: 0,
                      }

                      client.countries.forEach((country) => {
                        country.currencies.forEach((currency) => {
                          clientTotals.assets += currency.totalCash
                          clientTotals.liabilities += currency.totalBorrowing
                          clientTotals.netPosition += currency.netPosition
                        })
                      })

                      return (
                        <AccordionItem key={clientIndex} value={`client-${clientIndex}`}>
                          <AccordionTrigger className="hover:bg-gray-50 px-4">
                            <div className="flex justify-between w-full pr-4">
                              <span>{client.clientName}</span>
                              <span className={clientTotals.netPosition >= 0 ? "text-green-600" : "text-red-600"}>
                                {formatCurrency(clientTotals.netPosition)}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                              <div className="p-4 bg-gray-50 rounded-lg">
                                <div className="text-sm text-gray-500">Total Assets</div>
                                <div className="text-xl font-semibold">{formatCurrency(clientTotals.assets)}</div>
                              </div>
                              <div className="p-4 bg-gray-50 rounded-lg">
                                <div className="text-sm text-gray-500">Total Liabilities</div>
                                <div className="text-xl font-semibold">{formatCurrency(clientTotals.liabilities)}</div>
                              </div>
                              <div className="p-4 bg-gray-50 rounded-lg">
                                <div className="text-sm text-gray-500">Net Position</div>
                                <div
                                  className={`text-xl font-semibold ${clientTotals.netPosition >= 0 ? "text-green-600" : "text-red-600"}`}
                                >
                                  {formatCurrency(clientTotals.netPosition)}
                                </div>
                              </div>
                            </div>

                            {client.countries.map((country, countryIndex) => (
                              <div key={countryIndex} className="mb-6">
                                <h4 className="font-medium mb-2">Operating Country: {country.country}</h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Currency</TableHead>
                                      <TableHead className="text-right">Cash Amount</TableHead>
                                      <TableHead className="text-right">Borrowing Amount</TableHead>
                                      <TableHead className="text-right">Net Position</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {country.currencies.map((currency, currencyIndex) => (
                                      <TableRow key={currencyIndex}>
                                        <TableCell className="font-medium">{currency.currencyCode}</TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(currency.totalCash)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(currency.totalBorrowing)}
                                        </TableCell>
                                        <TableCell
                                          className={`text-right ${currency.netPosition >= 0 ? "text-green-600" : "text-red-600"}`}
                                        >
                                          {formatCurrency(currency.netPosition)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </div>
              </TabsContent>

              {/* RTC View Tab */}
              <TabsContent value="rtc" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Potential Upstream to RTC</CardTitle>
                      <CardDescription>From freely convertible currencies</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${summary.rtcMetrics.potentialUpstreamToRTC >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(summary.rtcMetrics.potentialUpstreamToRTC)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Restricted Funds</CardTitle>
                      <CardDescription>Cannot be moved to RTC</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">
                        {formatCurrency(summary.rtcMetrics.restrictedFunds)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Pending Conversion</CardTitle>
                      <CardDescription>Requires currency conversion</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {formatCurrency(summary.rtcMetrics.pendingConversion)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-4">Treasury Pooling Simulation</h3>
                  <PoolingSummary data={summary.poolingSimulation} />
                  <PoolingVisualization data={summary.poolingSimulation} />
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-4">RTC Impact Analysis</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Impact</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>RTC Location</TableCell>
                        <TableCell>{rtcConfig.location}</TableCell>
                        <TableCell>
                          <Badge variant="default">
                            {currencyConvertibility[rtcConfig.location as keyof typeof currencyConvertibility]?.notes}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Centralization Potential</TableCell>
                        <TableCell>
                          {formatCurrency(summary.rtcMetrics.potentialUpstreamToRTC + summary.rtcMetrics.pendingConversion)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">
                            {((summary.rtcMetrics.potentialUpstreamToRTC + summary.rtcMetrics.pendingConversion) /
                              (Object.values(summary.currencyTotals).reduce((sum, curr) => sum + Math.abs(curr.netPosition), 0)) *
                              100).toFixed(1)}% of total exposure
                          </Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
