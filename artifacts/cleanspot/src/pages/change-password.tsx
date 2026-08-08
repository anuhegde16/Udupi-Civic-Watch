/**
 * Forced password-change page shown after first login for seeded hierarchy
 * accounts. The session cookie is already issued so we can call the API
 * without re-submitting credentials.
 */
import { useState } from "react";
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
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
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

export default function ChangePassword() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: body.error ?? "Password change failed", variant: "destructive" });
        return;
      }
      toast({ title: "Password changed", description: "You can now use the app normally." });
      const dashboard = user?.role ? (ROLE_DASHBOARD[user.role] ?? "/") : "/";
      setLocation(dashboard, { replace: true });
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
          <h1 className="text-xl font-bold">Set your password</h1>
          <p className="text-xs opacity-70 mt-0.5">
            Your account uses a temporary password. Please set a new personal password to continue.
          </p>
        </div>
        <div className="px-8 py-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current (temporary) password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Temporary password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repeat new password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Saving…" : "Set password & continue"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
