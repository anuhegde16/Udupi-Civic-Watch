import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Hash } from "lucide-react";

export default function TrackSearch() {
  const [, setLocation] = useLocation();
  const [reportId, setReportId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(reportId.replace("#", "").trim(), 10);
    if (id > 0) {
      setLocation(`/track/${id}`);
    }
  };

  return (
    <div className="max-w-md mx-auto w-full pt-12 flex flex-col items-center text-center px-4 animate-in fade-in duration-500">
      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary shadow-xl shadow-primary/10">
        <Search className="w-10 h-10" />
      </div>
      <h2 className="text-3xl font-black text-foreground mb-2 tracking-tight">Track Your Report</h2>
      <p className="text-muted-foreground font-medium mb-8 max-w-sm leading-relaxed">
        Enter your report ID to check the status and see updates from the municipal team.
      </p>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="relative">
          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="number"
            min="1"
            placeholder="Enter report number e.g. 42"
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
            className="pl-10 h-14 text-lg rounded-2xl bg-card border-border focus-visible:ring-primary font-medium"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full h-14 text-lg font-black rounded-2xl shadow-lg shadow-primary/20 hover:-translate-y-1 transition-all"
          disabled={!reportId || parseInt(reportId, 10) <= 0}
        >
          <Search className="w-5 h-5 mr-2" />
          Find Report
        </Button>
      </form>

      <p className="mt-8 text-xs text-muted-foreground font-medium">
        Your report ID was shown after you submitted your waste report.
      </p>
    </div>
  );
}
