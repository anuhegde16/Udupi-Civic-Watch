import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { Mail, KeyRound, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "Enter the 6-digit code"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

interface ForgotPasswordProps {
  accentClass: string;
  onBack: () => void;
}

export function ForgotPassword({ accentClass, onBack }: ForgotPasswordProps) {
  const [step, setStep] = useState<"email" | "otp" | "done">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "", newPassword: "", confirmPassword: "" },
  });

  async function onSendOtp(values: z.infer<typeof emailSchema>) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Failed to send OTP. Try again.");
        return;
      }
      setResetEmail(values.email);
      setStep("otp");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyAndReset(values: z.infer<typeof otpSchema>) {
    setLoading(true);
    setError("");
    try {
      // Step 1: verify OTP
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, otp: values.otp }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        setError(data.message ?? "Invalid or expired code.");
        return;
      }
      const { resetToken: token } = await verifyRes.json();

      // Step 2: reset password
      const resetRes = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: token, newPassword: values.newPassword }),
      });
      if (!resetRes.ok) {
        const data = await resetRes.json().catch(() => ({}));
        setError(data.message ?? "Failed to reset password. Try again.");
        return;
      }
      setResetToken(token);
      setStep("done");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="w-14 h-14 text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Password updated!</h2>
        <p className="text-sm text-gray-500">
          Your password has been changed successfully. You can now log in with your new password.
        </p>
        <Button onClick={onBack} className={`w-full ${accentClass}`}>
          Back to Login
        </Button>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div>
        <button
          onClick={() => { setStep("email"); setError(""); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <p className="text-sm text-gray-600 mb-5">
          A 6-digit code was sent to <span className="font-semibold text-gray-900">{resetEmail}</span>. Enter it below along with your new password.
        </p>
        <Form {...otpForm}>
          <form onSubmit={otpForm.handleSubmit(onVerifyAndReset)} className="space-y-4">
            <FormField
              control={otpForm.control}
              name="otp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    6-Digit Code
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="123456"
                        maxLength={6}
                        inputMode="numeric"
                        className="pl-9 text-center tracking-widest font-mono text-lg"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={otpForm.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    New Password
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="password" placeholder="••••••••" className="pl-9" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={otpForm.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Confirm Password
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="password" placeholder="••••••••" className="pl-9" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
            )}
            <Button type="submit" className={`w-full ${accentClass}`} disabled={loading}>
              {loading ? "Verifying…" : "Reset Password"}
            </Button>
          </form>
        </Form>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
      </button>
      <p className="text-sm text-gray-600 mb-5">
        Enter your registered email address and we'll send a one-time code to reset your password.
      </p>
      <Form {...emailForm}>
        <form onSubmit={emailForm.handleSubmit(onSendOtp)} className="space-y-4">
          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Registered Email
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="your@email.com" className="pl-9" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}
          <Button type="submit" className={`w-full ${accentClass}`} disabled={loading}>
            {loading ? "Sending code…" : "Send Reset Code"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
