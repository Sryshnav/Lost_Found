import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Send } from 'lucide-react';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  item_id: string;
  message: string;
  read: boolean;
  created_at: string;
  items?: {
    title: string;
  };
  sender_profile?: {
    username: string;
    avatar_url?: string;
  };
  recipient_profile?: {
    username: string;
    avatar_url?: string;
  };
}

interface Conversation {
  item_id: string;
  item_title: string;
  other_user_id: string;
  other_user_username: string;
  other_user_avatar?: string;
  messages: Message[];
  last_message_date: string;
  unread_count: number;
}

export const Messages = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const channelRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages]);

  useEffect(() => {
    if (user) {
      fetchConversations();
      
      // Set up real-time subscription for messages
      channelRef.current = supabase
        .channel('messages-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `recipient_id=eq.${user.id}`
          },
          (payload) => {
            console.log('New message received:', payload);
            handleNewMessage(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `sender_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Message sent:', payload);
            handleNewMessage(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `recipient_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Message updated:', payload);
            fetchConversations();
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
        });

      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
      };
    }
  }, [user]);

  const handleNewMessage = async (newMessage: any) => {
    console.log('Processing new message:', newMessage);
    
    // Only process if this user is involved
    if (newMessage.sender_id !== user?.id && newMessage.recipient_id !== user?.id) {
      return;
    }

    // Immediately refresh conversations to get the latest data
    setTimeout(() => {
      fetchConversations();
    }, 100);
  };

  const fetchConversations = async () => {
    try {
      console.log('Fetching conversations for user:', user?.id);
      
      // Get all messages for the current user
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user?.id},recipient_id.eq.${user?.id}`)
        .order('created_at', { ascending: false });

      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
        setLoading(false);
        return;
      }

      if (!messagesData || messagesData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Get unique item IDs and user IDs
      const itemIds = [...new Set(messagesData.map(msg => msg.item_id))];
      const userIds = [...new Set([
        ...messagesData.map(msg => msg.sender_id),
        ...messagesData.map(msg => msg.recipient_id)
      ])];

      // Fetch items and profiles data
      const [itemsResponse, profilesResponse] = await Promise.all([
        supabase.from('items').select('id, title').in('id', itemIds),
        supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
      ]);

      const itemsData = itemsResponse.data || [];
      const profilesData = profilesResponse.data || [];

      // Enrich messages with item and profile data
      const enrichedMessages = messagesData.map(message => ({
        ...message,
        items: itemsData.find(item => item.id === message.item_id),
        sender_profile: profilesData.find(profile => profile.id === message.sender_id),
        recipient_profile: profilesData.find(profile => profile.id === message.recipient_id)
      }));

      // Group messages by conversation (item_id + other_user_id)
      const conversationMap = new Map<string, Conversation>();

      enrichedMessages.forEach(message => {
        const otherUserId = message.sender_id === user?.id ? message.recipient_id : message.sender_id;
        const conversationKey = `${message.item_id}-${otherUserId}`;
        
        if (!conversationMap.has(conversationKey)) {
          const otherUserProfile = message.sender_id === user?.id 
            ? message.recipient_profile 
            : message.sender_profile;
          
          conversationMap.set(conversationKey, {
            item_id: message.item_id,
            item_title: message.items?.title || 'Unknown Item',
            other_user_id: otherUserId,
            other_user_username: otherUserProfile?.username || 'Unknown User',
            other_user_avatar: otherUserProfile?.avatar_url,
            messages: [],
            last_message_date: message.created_at,
            unread_count: 0
          });
        }

        const conversation = conversationMap.get(conversationKey)!;
        conversation.messages.push(message);
        
        // Count unread messages from the other user
        if (message.recipient_id === user?.id && !message.read) {
          conversation.unread_count++;
        }
      });

      // Sort messages within each conversation by date
      conversationMap.forEach(conversation => {
        conversation.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });

      // Convert to array and sort by last message date
      const conversationsArray = Array.from(conversationMap.values()).sort((a, b) => 
        new Date(b.last_message_date).getTime() - new Date(a.last_message_date).getTime()
      );

      console.log('Conversations loaded:', conversationsArray.length);
      setConversations(conversationsArray);

      // Update selected conversation if it exists
      if (selectedConversation) {
        const updatedSelectedConversation = conversationsArray.find(
          conv => conv.item_id === selectedConversation.item_id && 
                  conv.other_user_id === selectedConversation.other_user_id
        );
        if (updatedSelectedConversation) {
          setSelectedConversation(updatedSelectedConversation);
        }
      }
    } catch (err) {
      console.error('Error in fetchConversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyMessage.trim() || !selectedConversation) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      console.log('Sending message...');
      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: user?.id,
          recipient_id: selectedConversation.other_user_id,
          item_id: selectedConversation.item_id,
          message: replyMessage.trim()
        });

      if (error) {
        console.error('Error sending reply:', error);
        throw new Error('Failed to send reply');
      }

      console.log('Message sent successfully');
      toast({
        title: "Reply Sent!",
        description: "Your reply has been sent successfully",
      });

      setReplyMessage('');
      // The real-time subscription will handle updating the conversations
    } catch (error) {
      console.error('Error sending reply:', error);
      toast({
        title: "Error",
        description: "Failed to send reply. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const markConversationAsRead = async (conversation: Conversation) => {
    try {
      const unreadMessageIds = conversation.messages
        .filter(msg => msg.recipient_id === user?.id && !msg.read)
        .map(msg => msg.id);

      if (unreadMessageIds.length > 0) {
        const { error } = await supabase
          .from('messages')
          .update({ read: true })
          .in('id', unreadMessageIds);

        if (!error) {
          fetchConversations(); // Refresh to update unread counts
        }
      }
    } catch (err) {
      console.error('Error marking conversation as read:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Messages</h1>
        <p className="text-gray-600">
          {conversations.length > 0 
            ? `You have ${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
            : 'No conversations yet'
          }
        </p>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No conversations yet</h3>
            <p className="text-gray-600">
              When you receive messages about your items, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversations List */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Conversations</h2>
            {conversations.map((conversation) => (
              <Card 
                key={`${conversation.item_id}-${conversation.other_user_id}`}
                className={`cursor-pointer transition-colors ${
                  selectedConversation?.item_id === conversation.item_id && 
                  selectedConversation?.other_user_id === conversation.other_user_id
                    ? 'border-blue-500 bg-blue-50' 
                    : 'hover:bg-gray-50'
                } ${conversation.unread_count > 0 ? 'border-blue-300' : ''}`}
                onClick={() => {
                  setSelectedConversation(conversation);
                  markConversationAsRead(conversation);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={conversation.other_user_avatar} />
                        <AvatarFallback>
                          {conversation.other_user_username?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">{conversation.item_title}</CardTitle>
                        <CardDescription>
                          with {conversation.other_user_username}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {conversation.unread_count > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {conversation.unread_count}
                        </Badge>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatDate(conversation.last_message_date)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-600 truncate">
                    {conversation.messages[conversation.messages.length - 1]?.message}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Conversation Detail */}
          <div className="space-y-4">
            {selectedConversation ? (
              <>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedConversation.other_user_avatar} />
                    <AvatarFallback>
                      {selectedConversation.other_user_username?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{selectedConversation.item_title}</h3>
                    <p className="text-sm text-gray-600">
                      Conversation with {selectedConversation.other_user_username}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.sender_id === user?.id
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        <p className="text-sm">{message.message}</p>
                        <p className={`text-xs mt-1 ${
                          message.sender_id === user?.id ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          {formatTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t pt-4">
                  <div className="space-y-4">
                    <Textarea
                      placeholder="Type your reply..."
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      rows={3}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleReply();
                        }
                      }}
                    />
                    <Button
                      onClick={handleReply}
                      disabled={sending}
                      className="w-full"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sending ? 'Sending...' : 'Send Reply'}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
                  <p className="text-gray-600">
                    Choose a conversation from the left to view the message history.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
