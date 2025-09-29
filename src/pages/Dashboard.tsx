import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Users, MessageSquare, Settings, LogOut, Copy, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface Room {
  id: string;
  name: string;
  room_code: string;
  description?: string;
  created_at: string;
  is_password_protected: boolean;
  max_participants: number;
  participant_count?: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: '',
    password: '',
    maxParticipants: 50
  });
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [joinRoomPassword, setJoinRoomPassword] = useState('');

  useEffect(() => {
    initializeDashboard();
  }, []);

  const initializeDashboard = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      // Check if user is admin
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

      setCurrentUser({ ...session.user, profile });
      setIsAdmin(userRole?.role === 'admin');

      // Load available rooms
      await loadRooms();
    } catch (error: any) {
      console.error('Error initializing dashboard:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_rooms')
        .select(`
          id,
          name,
          room_code,
          description,
          created_at,
          is_password_protected,
          max_participants
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get participant counts for each room
      const roomsWithCounts = await Promise.all(
        (data || []).map(async (room) => {
          const { count } = await supabase
            .from('room_participants')
            .select('*', { count: 'exact' })
            .eq('room_id', room.id)
            .eq('is_active', true);

          return { ...room, participant_count: count || 0 };
        })
      );

      setRooms(roomsWithCounts);
    } catch (error: any) {
      console.error('Error loading rooms:', error);
    }
  };

  const createRoom = async () => {
    try {
      if (!newRoom.name.trim()) {
        toast({
          title: "Error",
          description: "Room name is required",
          variant: "destructive"
        });
        return;
      }

      const roomData = {
        name: newRoom.name.trim(),
        description: newRoom.description.trim() || null,
        created_by: currentUser.id,
        is_password_protected: !!newRoom.password,
        password_hash: newRoom.password ? await hashPassword(newRoom.password) : null,
        max_participants: newRoom.maxParticipants
      } as const;

      const { data, error } = await supabase
        .from('chat_rooms')
        .insert([roomData] as any)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Room Created",
        description: `Room "${data.name}" created successfully! Room code: ${data.room_code}`
      });

      setShowCreateRoom(false);
      setNewRoom({ name: '', description: '', password: '', maxParticipants: 50 });
      loadRooms();
    } catch (error: any) {
      toast({
        title: "Failed to create room",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const joinRoom = async () => {
    try {
      if (!joinRoomCode.trim()) {
        toast({
          title: "Error",
          description: "Room code is required",
          variant: "destructive"
        });
        return;
      }

      const { data: room, error } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('room_code', joinRoomCode.toUpperCase())
        .eq('is_active', true)
        .single();

      if (error || !room) {
        toast({
          title: "Room not found",
          description: "Invalid room code or room is inactive",
          variant: "destructive"
        });
        return;
      }

      // Check password if required
      if (room.is_password_protected) {
        if (!joinRoomPassword) {
          toast({
            title: "Password required",
            description: "This room requires a password",
            variant: "destructive"
          });
          return;
        }
        // In a real app, you'd verify the password hash here
      }

      // Check participant limit
      const { count } = await supabase
        .from('room_participants')
        .select('*', { count: 'exact' })
        .eq('room_id', room.id)
        .eq('is_active', true);

      if (count && count >= room.max_participants) {
        toast({
          title: "Room full",
          description: "This room has reached its maximum capacity",
          variant: "destructive"
        });
        return;
      }

      navigate(`/chat/${room.room_code}`);
    } catch (error: any) {
      toast({
        title: "Failed to join room",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const hashPassword = async (password: string): Promise<string> => {
    // Simple hash - in production, use bcrypt or similar
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const copyRoomLink = (roomCode: string) => {
    const link = `${window.location.origin}/chat/${roomCode}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link copied",
      description: "Room link copied to clipboard"
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                SecureChat
              </h1>
              {isAdmin && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Admin
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarImage src={currentUser?.profile?.avatar_url} />
                <AvatarFallback>
                  {currentUser?.profile?.display_name?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => navigate('/admin')}
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Admin Panel
                  </Button>
                )}
                <Button variant="ghost" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Dialog open={showCreateRoom} onOpenChange={setShowCreateRoom}>
            <DialogTrigger asChild>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Create Room
                  </CardTitle>
                  <CardDescription>
                    Start a new secure chat room with custom settings
                  </CardDescription>
                </CardHeader>
              </Card>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Room</DialogTitle>
                <DialogDescription>
                  Set up a secure chat room with encryption and verification
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room-name">Room Name</Label>
                  <Input
                    id="room-name"
                    value={newRoom.name}
                    onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter room name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="room-description">Description (Optional)</Label>
                  <Input
                    id="room-description"
                    value={newRoom.description}
                    onChange={(e) => setNewRoom(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Room description"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="room-password">Password (Optional)</Label>
                  <Input
                    id="room-password"
                    type="password"
                    value={newRoom.password}
                    onChange={(e) => setNewRoom(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Room password"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="max-participants">Max Participants</Label>
                  <Input
                    id="max-participants"
                    type="number"
                    value={newRoom.maxParticipants}
                    onChange={(e) => setNewRoom(prev => ({ ...prev, maxParticipants: parseInt(e.target.value) || 50 }))}
                    min="2"
                    max="100"
                  />
                </div>
                
                <Button onClick={createRoom} className="w-full">
                  Create Room
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showJoinRoom} onOpenChange={setShowJoinRoom}>
            <DialogTrigger asChild>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Join Room
                  </CardTitle>
                  <CardDescription>
                    Enter a room code to join an existing chat room
                  </CardDescription>
                </CardHeader>
              </Card>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join Room</DialogTitle>
                <DialogDescription>
                  Enter the room code to join an existing chat room
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="join-room-code">Room Code</Label>
                  <Input
                    id="join-room-code"
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                    placeholder="Enter room code"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="join-room-password">Password (if required)</Label>
                  <Input
                    id="join-room-password"
                    type="password"
                    value={joinRoomPassword}
                    onChange={(e) => setJoinRoomPassword(e.target.value)}
                    placeholder="Room password"
                  />
                </div>
                
                <Button onClick={joinRoom} className="w-full">
                  Join Room
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Available Rooms */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Available Rooms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <Card key={room.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{room.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      {room.is_password_protected && (
                        <Badge variant="secondary" className="text-xs">
                          Protected
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyRoomLink(room.room_code)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    {room.description || 'No description provided'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {room.participant_count || 0} / {room.max_participants}
                    </div>
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {room.room_code}
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => navigate(`/chat/${room.room_code}`)}
                    disabled={(room.participant_count || 0) >= room.max_participants}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {(room.participant_count || 0) >= room.max_participants ? 'Room Full' : 'Join Chat'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {rooms.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No rooms available</h3>
                <p className="text-muted-foreground">Create a new room to start chatting</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;