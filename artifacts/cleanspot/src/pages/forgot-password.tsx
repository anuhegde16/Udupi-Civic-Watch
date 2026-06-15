import { useState, useEffect, useRef } from "react";
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
import { Mail, Lock, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

interface ForgotPasswordProps {
  accentClass: string;
  onBack: () => void;
}

const RESEND_COOLDOWN = 60; // 1 minute in seconds

export function ForgotPassword({ accentClass, onBack }: ForgotPasswordProps) {
  const [step, setStep] = useState<"email" | "otp" | "done">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // OTP step — plain state (no react-hook-form)
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpError, setOtpError] = useState("");
  const [pwError, setPwError] = useState("");

  // Resend timer
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [resendLoading, setResendLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === "otp") {
      setResendCooldown(RESEND_COOLDOWN);
      startTimer();
    }
    return () => stopTimer();
  }, [step]);

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          stopTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  async function sendOtp(email: string) {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? "Failed to send code.");
    }
  }

  async function onSendOtp(values: z.infer<typeof emailSchema>) {
    setLoading(true);
    setError("");
    try {
      await sendOtp(values.email);
      setResetEmail(values.email);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setOtpError("");
      setPwError("");
      setStep("otp");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setResendLoading(true);
    setError("");
    try {
      await sendOtp(resetEmail);
      setResendCooldown(RESEND_COOLDOWN);
      startTimer();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to resend code.");
    } finally {
      setResendLoading(false);
    }
  }

  async function onVerifyAndReset(e: React.FormEvent) {
    e.preventDefault();
    setOtpError("");
    setPwError("");
    setError("");

    let valid = true;
    if (otp.length < 4) {
      setOtpError("Enter the 6-digit code from your email.");
      valid = false;
    }
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      valid = false;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, otp }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        setOtpError(data.message ?? "Invalid or expired code. Request a new one.");
        return;
      }
      const { resetToken } = await verifyRes.json();

      const resetRes = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      if (!resetRes.ok) {
        const data = await resetRes.json().catch(() => ({}));
        setError(data.message ?? "Failed to reset password. Try again.");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function formatTime(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  if (step === "done") {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="w-14 h-14 text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Password updated!</h2>
        <p className="text-sm text-gray-500">
          Your password has been changed. You can now log in with your new password.
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
          type="button"
          onClick={() => { setStep("email"); setError(""); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <p className="text-sm text-gray-600 mb-4">
          A 6-digit code was sent to{" "}
          <span className="font-semibold text-gray-900">{resetEmail}</span>.
        </p>

        <form onSubmit={onVerifyAndReset} className="space-y-4">
          {/* OTP — plain controlled input, no react-hook-form */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              6-Digit Code
            </label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-4 py-1 text-center text-xl font-mono tracking-[0.4em] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {otpError && (
              <p className="text-xs text-destructive">{otpError}</p>
            )}
          </div>

          {/* Resend link */}
          <div className="text-right">
            {resendCooldown > 0 ? (
              <span className="text-xs text-muted-foreground">
                Resend in {formatTime(resendCooldown)}
              </span>
            ) : (
              <button
                type="button"
                onClick={onResend}
                disabled={resendLoading}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 ml-auto"
              >
                <RefreshCw className="w-3 h-3" />
                {resendLoading ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              New Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {pwError && (
              <p className="text-xs text-destructive">{pwError}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}

          <Button type="submit" className={`w-full ${accentClass}`} disabled={loading}>
            {loading ? "Verifying…" : "Reset Password"}
          </Button>
        </form>
      </div>
    );
  }

  // Step: email
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
      </button>
      <p className="text-sm text-gray-600 mb-5">
        Enter your registered email and we'll send a one-time code to reset your password.
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
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
