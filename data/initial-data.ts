import { FormValues } from "@/app/liquidity-form"

export const initialData: FormValues = {
  entries: [
    {
      clientName: "APAC Freely Convertible",
      operatingCountry: "Singapore",
      currencies: [
        {
          currencyCode: "USD",
          cashAmount: 1000000,
          cashInterestRate: 2.5,
          borrowingAmount: 500000,
          borrowingInterestRate: 3.5,
          borrowingTenor: "Short Term" as const,
        },
        {
          currencyCode: "SGD",
          cashAmount: 750000,
          cashInterestRate: 1.8,
          borrowingAmount: 250000,
          borrowingInterestRate: 2.8,
          borrowingTenor: "Short Term" as const,
        }
      ],
    },
    {
      clientName: "China Restricted",
      operatingCountry: "China",
      currencies: [
        {
          currencyCode: "CNY",
          cashAmount: 2000000,
          cashInterestRate: 1.5,
          borrowingAmount: 1000000,
          borrowingInterestRate: 2.5,
          borrowingTenor: "Long Term" as const,
        },
        {
          currencyCode: "USD",
          cashAmount: 1500000,
          cashInterestRate: 2.3,
          borrowingAmount: 750000,
          borrowingInterestRate: 3.3,
          borrowingTenor: "Short Term" as const,
        }
      ],
    },
    {
      clientName: "Malaysia Partially Convertible",
      operatingCountry: "Malaysia",
      currencies: [
        {
          currencyCode: "MYR",
          cashAmount: 3000000,
          cashInterestRate: 3.0,
          borrowingAmount: 1500000,
          borrowingInterestRate: 4.0,
          borrowingTenor: "Short Term" as const,
        },
        {
          currencyCode: "USD",
          cashAmount: 800000,
          cashInterestRate: 2.4,
          borrowingAmount: 400000,
          borrowingInterestRate: 3.4,
          borrowingTenor: "Long Term" as const,
        }
      ],
    },
    {
      clientName: "India Restricted",
      operatingCountry: "India",
      currencies: [
        {
          currencyCode: "INR",
          cashAmount: 4000000,
          cashInterestRate: 4.5,
          borrowingAmount: 2000000,
          borrowingInterestRate: 5.5,
          borrowingTenor: "Short Term" as const,
        },
        {
          currencyCode: "USD",
          cashAmount: 1200000,
          cashInterestRate: 2.2,
          borrowingAmount: 600000,
          borrowingInterestRate: 3.2,
          borrowingTenor: "Long Term" as const,
        }
      ],
    }
  ]
} 