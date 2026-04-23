import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertTriangle, MapPin, Camera, ArrowRight, Activity, Map } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto w-full pt-4 md:pt-12">
      <div className="flex-1 flex flex-col">
        <div className="mb-10 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary mb-2 shadow-sm">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900">
            See it.<br/>Report it.<br/><span className="text-primary">We clean it.</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-sm mx-auto leading-relaxed px-4">
            Help keep our community clean. Send reports directly to the city sanitation team in seconds.
          </p>
        </div>

        <div className="space-y-6 mt-4">
          <Link href="/report" className="block w-full">
            <Button size="lg" className="w-full h-16 md:h-20 text-lg md:text-xl font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all shadow-primary/25">
              <Camera className="w-6 h-6 mr-3" />
              Report Waste Now
              <ArrowRight className="w-6 h-6 ml-auto" />
            </Button>
          </Link>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
              <MapPin className="w-8 h-8 text-primary mb-3 bg-primary/10 p-1.5 rounded-lg" />
              <h3 className="font-semibold text-gray-900 mb-1">Location Auto-Detected</h3>
              <p className="text-sm text-gray-500">No need to type addresses</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
              <Activity className="w-8 h-8 text-primary mb-3 bg-primary/10 p-1.5 rounded-lg" />
              <h3 className="font-semibold text-gray-900 mb-1">Track Progress</h3>
              <p className="text-sm text-gray-500">Get updates as we clean</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-12 text-center text-sm text-gray-400 pb-8">
        <p>A civic tool by CleanSpot</p>
      </div>
    </div>
  );
}
