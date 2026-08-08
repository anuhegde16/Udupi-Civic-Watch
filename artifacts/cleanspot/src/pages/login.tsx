import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useLogin } from "@workspace/api-client-react";
import { Shield, UserCog, Lock, Phone } from "lucide-react";
import { ForgotPassword } from "./forgot-password";

const schema = z.object({
  // Accepts an email address or a phone number (for Udupi hierarchy accounts)
  email: z.string().min(1, "Enter your email or phone number"),
  password: z.string().min(1, "Password is required"),
});

interface LoginProps {
  portalType?: "staff" | "admin" | "master" | "supervisory" | "commissioner";
}

export default function LoginPage({ portalType }: LoginProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const [showForgot, setShowForgot] = useState(false);

  const isAdmin = portalType === "admin";
  const isMaster = portalType === "master";
  const isSupervisory = portalType === "supervisory";
  const isCommissioner = portalType === "commissioner";

  const defaultEmail = isAdmin
    ? "admin@udupicivicwatch.com"
    : isMaster
    ? "saligrama@udupicivicspot.com"
    : "";

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail, password: "" },
  });

  function onSubmit(values: z.infer<typeof schema>) {
    login.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          const body = data as any;

          // Token-provisioned accounts (new hierarchy staff) cannot use the
          // login → change-password path because they have no known current
          // password. The server returns requiresActivation: true without
          // issuing a session cookie.
          if (body?.requiresActivation) {
            toast({
              title: "Account not yet activated",
              description:
                "Please use the activation link sent by your administrator. Contact them if you don't have it.",
              variant: "destructive",
            });
            return;
          }

          // Admin-forced reset (user knows current password): redirect to the
          // change-password page so they can set a new one.
          if (body?.passwordResetRequired) {
            setLocation("/change-password", { replace: true });
            return;
          }

          const role = body?.user?.role;
          if (role === "admin" || role === "control_center") {
            setLocation("/admin/dashboard", { replace: true });
          } else if (role === "panchayat_admin") {
            setLocation("/master/dashboard", { replace: true });
          } else if (role === "commissioner") {
            setLocation("/commissioner/dashboard", { replace: true });
          } else if (role === "officer" || role === "field_officer") {
            setLocation("/officer/dashboard", { replace: true });
          } else if (role === "supervisor") {
            setLocation("/supervisor/dashboard", { replace: true });
          } else if (role === "health_inspector") {
            setLocation("/health-inspector/dashboard", { replace: true });
          } else if (role === "environmental_engineer") {
            setLocation("/env-engineer/dashboard", { replace: true });
          } else if (role === "community_mobiliser") {
            setLocation("/community-mobiliser/dashboard", { replace: true });
          } else {
            setLocation("/", { replace: true });
          }
        },
        onError: () => {
          toast({
            title: "Login failed",
            description: "Check your credentials and try again.",
            variant: "destructive",
          });
        },
      }
    );
  }

  const headerBg = isAdmin ? "bg-slate-800" : isMaster ? "bg-indigo-700" : isSupervisory ? "bg-violet-700" : isCommissioner ? "bg-teal-800" : "bg-green-700";
  const btnClass = isAdmin ? "bg-slate-800 hover:bg-slate-700" : isMaster ? "bg-indigo-700 hover:bg-indigo-600" : isSupervisory ? "bg-violet-700 hover:bg-violet-600" : isCommissioner ? "bg-teal-800 hover:bg-teal-700" : "bg-green-700 hover:bg-green-600";
  const portalLabel = isAdmin ? "Control Center" : isMaster ? "Panchayat Admin Portal" : isSupervisory ? "Supervisory Staff Portal" : isCommissioner ? "Municipality Commissioner" : "Staff Portal";
  const portalDesc = isAdmin ? "District Administration Login" : isMaster ? "Panchayat Administration Login" : isSupervisory ? "Health Inspectors & Environmental Engineers" : isCommissioner ? "Commissioner Administration Login" : "Field Staff Login";
  const placeholder = isAdmin ? "admin@udupicivicwatch.com" : isMaster ? "saligrama@udupicivicspot.com" : "Phone number";

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 bg-gradient-to-br ${isAdmin ? "from-slate-100 to-slate-200" : isMaster ? "from-indigo-50 to-indigo-100" : isSupervisory ? "from-violet-50 to-purple-100" : isCommissioner ? "from-teal-50 to-cyan-100" : "from-green-50 to-emerald-100"}`}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className={`px-8 py-6 text-white ${headerBg}`}>
          <div className="flex items-center gap-3 mb-1">
            {isAdmin ? (
              <Shield className="w-6 h-6" />
            ) : (
              <UserCog className="w-6 h-6" />
            )}
            <span className="text-sm font-semibold uppercase tracking-widest opacity-80">
              {portalLabel}
            </span>
          </div>
          <h1 className="text-xl font-bold leading-tight">
            Udupi Civic Watch
          </h1>
          <p className="text-xs opacity-70 mt-0.5">
            {showForgot ? "Password Reset" : portalDesc}
          </p>
        </div>

        {/* Form area */}
        <div className="px-8 py-7">
          {showForgot ? (
            <ForgotPassword
              accentClass={btnClass}
              onBack={() => setShowForgot(false)}
            />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Phone number or email
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder={placeholder}
                            className="pl-9"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Password
                        </FormLabel>
                        <button
                          type="button"
                          onClick={() => setShowForgot(true)}
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            className="pl-9"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className={`w-full mt-2 ${btnClass}`}
                  disabled={login.isPending}
                >
                  {login.isPending ? "Signing in…" : "Sign In"}
                </Button>
              </form>
            </Form>
          )}
        </div>

        <div className="px-8 pb-6 text-center text-xs text-muted-foreground">
          Udupi District Administration &copy; 2025
        </div>
      </div>
    </div>
  );
}
