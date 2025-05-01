"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ClientBalanceExcel({ form }: { form: any }) {
  // Export to Excel
  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = form.getValues().entries.flatMap((entry: any) =>
      entry.currencies.map((currency: any) => ({
        clientName: entry.clientName,
        operatingCountry: entry.operatingCountry,
        currencyCode: currency.currencyCode,
        cashAmount: currency.cashAmount,
        cashInterestRate: currency.cashInterestRate,
        borrowingAmount: currency.borrowingAmount,
        borrowingInterestRate: currency.borrowingInterestRate,
        borrowingTenor: currency.borrowingTenor,
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ClientBalance");
    XLSX.writeFile(wb, "ClientBalanceEntry.xlsx");
  };

  // Import from Excel
  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const XLSX = await import("xlsx");
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet) as any[];
      // Group by clientName + operatingCountry
      const grouped: Record<string, any> = {};
      json.forEach(row => {
        const key = `${row.clientName}||${row.operatingCountry}`;
        if (!grouped[key]) {
          grouped[key] = {
            clientName: row.clientName,
            operatingCountry: row.operatingCountry,
            currencies: []
          };
        }
        grouped[key].currencies.push({
          currencyCode: row.currencyCode,
          cashAmount: row.cashAmount,
          cashInterestRate: row.cashInterestRate,
          borrowingAmount: row.borrowingAmount,
          borrowingInterestRate: row.borrowingInterestRate,
          borrowingTenor: row.borrowingTenor,
        });
      });
      form.reset({ entries: Object.values(grouped) });
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex gap-2 mt-4">
      <Button variant="secondary" onClick={exportToExcel}>Export to Excel</Button>
      <Input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} className="w-auto" />
    </div>
  );
} 