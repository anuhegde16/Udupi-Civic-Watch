/**
 * Account activation page for Udupi hierarchy staff.
 *
 * Usage:
 *   /activate?token=<40-char hex token>
 *
 * The admin retrieves pending tokens from GET /api/admin/hierarchy-accounts
 * and distributes them out-of-band (WhatsApp / printed sheet).
 * Staff open this link, set their personal password, and are logged in.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const schema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/admin/dashboard",
  control_center: "/admin/dashboard",
  panchayat_admin: "/master/dashboard",
  commissioner: "/master/dashboard",
  officer: "/officer/dashboard",
  field_officer: "/officer/dashboard",
  supervisor: "/supervisor/dashboard",
  health_inspector: "/health-inspector/dashboard",
  environmental_engineer: "/env-engineer/dashboard",
  community_mobiliser: "/community-mobiliser/dashboard",
};

export default function Activate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string>("");
  const [tokenError, setTokenError] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") ?? "";
    if (!t || !/^[0-9a-f]{40}$/i.test(t)) {
      setTokenError(
        "This activation link appears to be invalid or incomplete. Ask your administrator for the correct link.",
      );
    } else {
      setToken(t);
    }
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activationToken: token, newPassword: values.newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Activation failed",
          description: body.error ?? "Could not activate account",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Account activated", description: "You are now logged in." });
      const role: string = body.user?.role ?? "";
      setLocation(ROLE_DASHBOARD[role] ?? "/", { replace: true });
    } catch {
      toast({ title: "Error", description: "Could not connect to server", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-8 py-6 bg-green-700 text-white">
          <h1 className="text-xl font-bold">Activate your account</h1>
          <p className="text-xs opacity-70 mt-0.5">
            Set a personal password to access CleanSpot.
          </p>
        </div>
        <div className="px-8 py-8">
          {tokenError ? (
            <p className="text-sm text-red-600">{tokenError}</p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="At least 8 characters" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Repeat new password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Activating…" : "Activate account & sign in"}
                </Button>
              </form>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
