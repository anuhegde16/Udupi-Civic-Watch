import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const isAdmin = false;

  const loginMutation = useMutation({
    mutationFn: async (values: z.infer<typeof schema>) => {
      return apiRequest("POST", "/api/auth/login", values);
    },
    onSuccess: async () => {
      toast({ title: "Signed in" });
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Login failed", variant: "destructive" });
    },
  });

  function onSubmit(values: z.infer<typeof schema>) {
    loginMutation.mutate(values);
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-black text-foreground tracking-tight leading-none mb-2">Simple Login</h1>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
        {isAdmin ? "Administrator Email" : "Official Email Address"}
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder={isAdmin ? "admin@udupicivicwatch.com" : "byndoor@udupicivicspot.com"} {...field} />
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
                <FormControl>
                  <Input type="password" placeholder="Password@123" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full">Sign In</Button>
        </form>
      </Form>
    </div>
  );
}
