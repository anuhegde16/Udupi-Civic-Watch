import { useState } from "react";
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
import { Loader2, ShieldCheck, Anchor, Droplets } from "lucide-react";

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
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          toast({ title: "Welcome back", description: `Logged in as ${res.user.name}` });
          if (res.user.role === "admin") {
            setLocation("/admin/dashboard");
          } else {
            setLocation("/officer/dashboard");
          }
        },
        onError: (err) => {
          toast({ 
            title: "Login failed", 
            description: err.message || "Invalid credentials", 
            variant: "destructive" 
          });
        },
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 animate-in fade-in duration-500 min-h-[calc(100vh-8rem)]">
      <div className="w-full max-w-4xl flex flex-col md:flex-row bg-card rounded-[2.5rem] shadow-2xl border border-border/50 overflow-hidden relative">
        
        {/* Left Side - Image & Vibe */}
        <div className="md:w-1/2 relative min-h-[300px] md:min-h-[600px] hidden md:block">
          <img src="/login-bg.png" alt="Fishing boats at dusk" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-primary/40 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/50 to-transparent" />
          
          <div className="absolute bottom-0 left-0 p-10 text-primary-foreground">
            <div className="w-12 h-12 rounded-2xl bg-secondary/20 backdrop-blur-md flex items-center justify-center mb-6">
              <Anchor className="w-6 h-6 text-secondary" />
            </div>
            <h2 className="text-3xl font-black mb-3">Protecting Our Coast</h2>
            <p className="text-primary-foreground/80 font-medium leading-relaxed max-w-sm">
              Staff portal for managing coastal waste reports in Udupi district. Your work keeps our beaches clean and safe.
            </p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-secondary/5 rounded-bl-[100px] -z-10" />
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4 shadow-sm shadow-primary/10">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-4xl font-black text-foreground tracking-tight">Staff Portal</h1>
            <p className="text-muted-foreground mt-2 font-medium">Sign in to manage your assigned coastal zone</p>
          </div>

          <div className="bg-background/50 rounded-3xl p-2 md:p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-bold">Email Address</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="officer@cleanspot.city" 
                          {...field} 
                          className="h-14 bg-muted/50 rounded-xl focus-visible:ring-primary border-border text-base px-4 font-medium"
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
                      <FormLabel className="text-foreground font-bold">Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          {...field} 
                          className="h-14 bg-muted/50 rounded-xl focus-visible:ring-primary border-border text-base px-4 font-medium"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full h-14 text-lg font-black rounded-xl mt-8 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-1">
              <Droplets className="w-3 h-3 text-secondary" /> CleanSpot Udupi Admin System
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
