import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Users, Chrome } from 'lucide-react';

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [adminCredentials, setAdminCredentials] = useState({
    email: '',
    password: ''
  });

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/');
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Authentication Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      // Check if admin is in allowlist
      const { data: adminCheck } = await supabase
        .from('admin_allowlist')
        .select('*')
        .eq('email', adminCredentials.email)
        .eq('is_active', true)
        .single();

      if (!adminCheck) {
        throw new Error('Unauthorized admin access');
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: adminCredentials.email,
        password: adminCredentials.password
      });

      if (error) throw error;

      toast({
        title: "Admin Login Successful",
        description: "Welcome to the admin panel"
      });
    } catch (error: any) {
      toast({
        title: "Admin Login Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            SecureChat
          </h1>
          <p className="text-muted-foreground mt-2">
            Secure, verified communication platform
          </p>
        </div>

        <Tabs defaultValue="user" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="user" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Login
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Admin Login
            </TabsTrigger>
          </TabsList>

          <TabsContent value="user">
            <Card>
              <CardHeader>
                <CardTitle>User Access</CardTitle>
                <CardDescription>
                  Join secure chat rooms with Google authentication
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center gap-2"
                >
                  <Chrome className="h-4 w-4" />
                  {loading ? 'Signing in...' : 'Continue with Google'}
                </Button>
                
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Security Features:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Camera verification every 10 minutes</li>
                    <li>• Voice recording for security</li>
                    <li>• Location tracking for verification</li>
                    <li>• End-to-end encrypted messages</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admin">
            <Card>
              <CardHeader>
                <CardTitle>Admin Access</CardTitle>
                <CardDescription>
                  Monitor platform security and user verification
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-email">Admin Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      value={adminCredentials.email}
                      onChange={(e) => setAdminCredentials(prev => ({
                        ...prev,
                        email: e.target.value
                      }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="admin-password">Password</Label>
                    <Input
                      id="admin-password"
                      type="password"
                      value={adminCredentials.password}
                      onChange={(e) => setAdminCredentials(prev => ({
                        ...prev,
                        password: e.target.value
                      }))}
                      required
                    />
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? 'Signing in...' : 'Admin Login'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Auth;