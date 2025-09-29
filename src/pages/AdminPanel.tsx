import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Users, Camera, Mic, MapPin, Shield, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface User {
  id: string;
  email: string;
  created_at: string;
  profiles?: {
    display_name?: string;
    avatar_url?: string;
    is_verified: boolean;
  };
}

interface VerificationData {
  images: any[];
  audio: any[];
  locations: any[];
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<VerificationData>({
    images: [],
    audio: [],
    locations: []
  });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      // Check if user is admin
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

      if (userRole?.role !== 'admin') {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      setIsAdmin(true);
      await loadUsers();
    } catch (error: any) {
      console.error('Error checking admin access:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          user_id,
          display_name,
          avatar_url,
          is_verified,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get email addresses from auth metadata (simplified for demo)
      const usersWithEmail = (data || []).map(profile => ({
        id: profile.user_id,
        email: `user_${profile.user_id.slice(0, 8)}@example.com`, // Placeholder since we can't access auth.users
        created_at: profile.created_at,
        profiles: {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          is_verified: profile.is_verified
        }
      }));

      setUsers(usersWithEmail);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive"
      });
    }
  };

  const loadUserVerificationData = async (userId: string) => {
    try {
      // Load verification images
      const { data: images } = await supabase
        .from('verification_images')
        .select('*')
        .eq('user_id', userId)
        .order('captured_at', { ascending: false })
        .limit(20);

      // Load verification audio
      const { data: audio } = await supabase
        .from('verification_audio')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(20);

      // Load location tracking
      const { data: locations } = await supabase
        .from('location_tracking')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(50);

      setVerificationData({
        images: images || [],
        audio: audio || [],
        locations: locations || []
      });
    } catch (error: any) {
      console.error('Error loading verification data:', error);
      toast({
        title: "Error",
        description: "Failed to load verification data",
        variant: "destructive"
      });
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
    loadUserVerificationData(userId);
  };

  const getImageUrl = (imagePath: string) => {
    const { data } = supabase.storage
      .from('verification-images')
      .getPublicUrl(imagePath);
    return data.publicUrl;
  };

  const getAudioUrl = (audioPath: string) => {
    const { data } = supabase.storage
      .from('verification-audio')
      .getPublicUrl(audioPath);
    return data.publicUrl;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Admin Panel</h1>
              </div>
            </div>
            <Badge variant="secondary">
              {users.length} Total Users
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Users List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Platform Users
                </CardTitle>
                <CardDescription>
                  Click on a user to view their verification data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedUser === user.id 
                            ? 'bg-primary/10 border-primary' 
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => handleUserSelect(user.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.profiles?.avatar_url} />
                            <AvatarFallback>
                              {user.profiles?.display_name?.charAt(0) || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {user.profiles?.display_name || 'Anonymous'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {user.profiles?.is_verified && (
                                <Badge variant="secondary" className="text-xs">
                                  Verified
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Verification Data */}
          <div className="lg:col-span-2">
            {selectedUser ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    User Verification Data
                  </CardTitle>
                  <CardDescription>
                    Security verification data for user monitoring
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="images" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="images" className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Images ({verificationData.images.length})
                      </TabsTrigger>
                      <TabsTrigger value="audio" className="flex items-center gap-2">
                        <Mic className="h-4 w-4" />
                        Audio ({verificationData.audio.length})
                      </TabsTrigger>
                      <TabsTrigger value="location" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Location ({verificationData.locations.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="images" className="mt-4">
                      <ScrollArea className="h-96">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {verificationData.images.map((image) => (
                            <div key={image.id} className="border rounded-lg p-2">
                              <img
                                src={getImageUrl(image.image_url)}
                                alt="Verification"
                                className="w-full h-32 object-cover rounded"
                              />
                              <p className="text-xs text-muted-foreground mt-2">
                                {new Date(image.captured_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                        {verificationData.images.length === 0 && (
                          <p className="text-center text-muted-foreground py-8">
                            No verification images found
                          </p>
                        )}
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="audio" className="mt-4">
                      <ScrollArea className="h-96">
                        <div className="space-y-4">
                          {verificationData.audio.map((audio) => (
                            <div key={audio.id} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">
                                  Audio Recording
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {audio.duration_seconds}s
                                </span>
                              </div>
                              <audio controls className="w-full">
                                <source src={getAudioUrl(audio.audio_url)} type="audio/webm" />
                                Your browser does not support audio playback.
                              </audio>
                              <p className="text-xs text-muted-foreground mt-2">
                                {new Date(audio.recorded_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                        {verificationData.audio.length === 0 && (
                          <p className="text-center text-muted-foreground py-8">
                            No audio recordings found
                          </p>
                        )}
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="location" className="mt-4">
                      <ScrollArea className="h-96">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Timestamp</TableHead>
                              <TableHead>Latitude</TableHead>
                              <TableHead>Longitude</TableHead>
                              <TableHead>Accuracy</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {verificationData.locations.map((location) => (
                              <TableRow key={location.id}>
                                <TableCell className="text-sm">
                                  {new Date(location.recorded_at).toLocaleString()}
                                </TableCell>
                                <TableCell>{location.latitude.toFixed(6)}</TableCell>
                                <TableCell>{location.longitude.toFixed(6)}</TableCell>
                                <TableCell>{location.accuracy}m</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {verificationData.locations.length === 0 && (
                          <p className="text-center text-muted-foreground py-8">
                            No location data found
                          </p>
                        )}
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Select a User</h3>
                  <p className="text-muted-foreground">
                    Choose a user from the list to view their verification data
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;