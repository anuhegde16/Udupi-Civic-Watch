import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Waves, ShieldCheck } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          toast({ title: "Welcome back", description: `Logged in as ${res.user.name}` });
          setLocation(res.user.role === "admin" ? "/admin/dashboard" : "/officer/dashboard");
        },
        onError: (err) => {
          toast({ title: "Login failed", description: err.message || "Invalid credentials", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 animate-in fade-in duration-500 min-h-[calc(100vh-10rem)]">
      <div className="w-full max-w-4xl flex flex-col md:flex-row bg-card rounded-[2rem] shadow-2xl border border-border/50 overflow-hidden relative">

        {/* Left — official identity panel */}
        <div className="md:w-5/12 relative min-h-[280px] md:min-h-[560px] hidden md:flex flex-col">
          <img src="/login-bg.png" alt="Udupi coast" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-primary/50 to-primary/80" />

          <div className="absolute inset-0 flex flex-col justify-between p-10 text-primary-foreground">
            {/* Govt emblem area */}
            <div>
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center mb-6 border border-white/20">
                <Waves className="w-7 h-7 text-white" />
              </div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                Government of Karnataka
              </div>
              <h2 className="text-2xl font-black text-white leading-tight">
                Udupi District<br />Administration
              </h2>
              <div className="mt-2 text-[11px] font-semibold text-white/60 uppercase tracking-wider">
                Swachh Bharat Mission · Coastal Sanitation
              </div>
            </div>

            <div>
              <div className="h-px bg-white/20 mb-6" />
              <p className="text-white/80 font-medium leading-relaxed text-sm">
                Authorised personnel portal for managing coastal waste reports across Udupi district. Your work directly protects the Arabian Sea coastline.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 h-1 rounded-full bg-white/15">
                  <div className="h-full w-3/4 rounded-full bg-secondary" />
                </div>
                <span className="text-xs font-bold text-white/70">75% reports resolved this month</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right — login form */}
        <div className="md:w-7/12 p-8 md:p-12 flex flex-col justify-center relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-secondary/5 rounded-bl-[100px] -z-10" />

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight leading-none">Staff Portal</h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Udupi District Municipality</p>
              </div>
            </div>
            <p className="text-muted-foreground font-medium text-sm">
              Sign in with your official government credentials to manage your assigned coastal zone.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-bold text-sm">Official Email Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="officer@udupi.gov.in"
                        {...field}
                        className="h-13 bg-muted/50 rounded-xl focus-visible:ring-primary border-border text-base px-4 font-medium"
                      />
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
                    <FormLabel className="text-foreground font-bold text-sm">Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        className="h-13 bg-muted/50 rounded-xl focus-visible:ring-primary border-border text-base px-4 font-medium"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-14 text-lg font-black rounded-xl mt-6 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Sign In to Portal"}
              </Button>
            </form>
          </Form>

          <div className="mt-8 p-4 bg-muted/50 rounded-xl border border-border/50">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Official Notice</p>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              This system is reserved for authorised Udupi District Administration staff only. Unauthorised access is prohibited under the IT Act, 2000.
            </p>
          </div>

          <p className="mt-6 text-xs text-muted-foreground font-medium text-center">
            CleanSpot · Udupi District Administration · Govt. of Karnataka
          </p>
        </div>
      </div>
    </div>
  );
}
