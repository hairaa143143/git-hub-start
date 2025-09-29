import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Send, Users, Settings, Phone, Video, Paperclip, Smile } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface Message {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  profiles: {
    display_name: string;
    avatar_url?: string;
  };
}

interface Room {
  id: string;
  name: string;
  room_code: string;
  created_by: string;
  max_participants: number;
}

const Chat = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeChat();
    return () => {
      // Cleanup subscriptions
    };
  }, [roomCode]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeChat = async () => {
    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      setCurrentUser({ ...session.user, profile });

      // Get room details
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('room_code', roomCode)
        .eq('is_active', true)
        .single();

      if (roomError || !roomData) {
        toast({
          title: "Room Not Found",
          description: "The chat room doesn't exist or is inactive",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      setRoom(roomData);

      // Join room if not already a participant
      await joinRoom(roomData.id, session.user.id);

      // Load messages
      await loadMessages(roomData.id);

      // Load participants
      await loadParticipants(roomData.id);

      // Set up real-time subscriptions
      setupRealtimeSubscriptions(roomData.id);

    } catch (error: any) {
      console.error('Error initializing chat:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (roomId: string, userId: string) => {
    const { error } = await supabase
      .from('room_participants')
      .upsert({ 
        room_id: roomId, 
        user_id: userId,
        is_active: true 
      });

    if (error) console.error('Error joining room:', error);
  };

  const loadMessages = async (roomId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        user_id,
        created_at
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error loading messages:', error);
    } else {
      // Get profile data for each message
      const messagesWithProfiles = await Promise.all(
        (data || []).map(async (message) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', message.user_id)
            .single();

          return {
            ...message,
            profiles: profile || { display_name: 'Anonymous', avatar_url: null }
          };
        })
      );
      
      setMessages(messagesWithProfiles);
    }
  };

  const loadParticipants = async (roomId: string) => {
    const { data, error } = await supabase
      .from('room_participants')
      .select(`
        user_id,
        joined_at,
        profiles:user_id(display_name, avatar_url)
      `)
      .eq('room_id', roomId)
      .eq('is_active', true);

    if (error) {
      console.error('Error loading participants:', error);
    } else {
      setParticipants(data || []);
    }
  };

  const setupRealtimeSubscriptions = (roomId: string) => {
    // Subscribe to new messages
    const messagesChannel = supabase
      .channel(`messages:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`
        },
        async (payload) => {
          // Fetch the complete message with profile data
          const { data: message } = await supabase
            .from('messages')
            .select('id, content, user_id, created_at')
            .eq('id', payload.new.id)
            .single();

          if (message) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, avatar_url')
              .eq('user_id', message.user_id)
              .single();

            const messageWithProfile = {
              ...message,
              profiles: profile || { display_name: 'Anonymous', avatar_url: null }
            };

            setMessages(prev => [...prev, messageWithProfile]);
          }
        }
      )
      .subscribe();

    // Subscribe to participant changes
    const participantsChannel = supabase
      .channel(`participants:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${roomId}`
        },
        () => {
          loadParticipants(roomId);
        }
      )
      .subscribe();
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !room || !currentUser) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          room_id: room.id,
          user_id: currentUser.id,
          content: newMessage.trim(),
          message_type: 'text'
        });

      if (error) throw error;

      setNewMessage('');
    } catch (error: any) {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-80 border-r bg-muted/30">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{room?.name}</h2>
              <p className="text-sm text-muted-foreground">Room: {room?.room_code}</p>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {participants.length}
            </Badge>
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-medium mb-3">Participants ({participants.length})</h3>
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {participants.map((participant) => (
                <div key={participant.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={participant.profiles?.avatar_url} />
                    <AvatarFallback>
                      {participant.profiles?.display_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {participant.profiles?.display_name || 'Anonymous'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {participant.user_id === currentUser?.id ? 'You' : 'Online'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="absolute bottom-4 left-4 right-4">
          <Button
            onClick={() => navigate('/')}
            variant="outline"
            className="w-full"
          >
            Leave Room
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="p-4 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="font-semibold">{room?.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {participants.length} participants • End-to-end encrypted
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Video className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.user_id === currentUser?.id ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    message.user_id === currentUser?.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.user_id !== currentUser?.id && (
                    <p className="text-xs font-medium mb-1 opacity-70">
                      {message.profiles?.display_name || 'Anonymous'}
                    </p>
                  )}
                  <p className="text-sm">{message.content}</p>
                  <p className={`text-xs mt-1 opacity-70`}>
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Message Input */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Smile className="h-4 w-4" />
            </Button>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={!newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;