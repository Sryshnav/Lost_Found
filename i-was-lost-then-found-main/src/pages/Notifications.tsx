
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Notification } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, MessageSquare } from 'lucide-react';

interface EnhancedNotification extends Notification {
  items?: {
    title: string;
  };
}

export const Notifications = () => {
  const [notifications, setNotifications] = useState<EnhancedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const { data: notificationsData, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
      } else if (notificationsData) {
        // For message notifications, get the item details
        const messageNotifications = notificationsData.filter(n => n.type === 'message');
        
        if (messageNotifications.length > 0) {
          // Get the latest messages to find item_id
          const { data: messagesData } = await supabase
            .from('messages')
            .select('item_id, created_at')
            .eq('recipient_id', user?.id)
            .order('created_at', { ascending: false })
            .limit(messageNotifications.length);

          if (messagesData && messagesData.length > 0) {
            const itemIds = [...new Set(messagesData.map(msg => msg.item_id))];
            
            // Fetch item details
            const { data: itemsData } = await supabase
              .from('items')
              .select('id, title')
              .in('id', itemIds);

            // Map notifications with item details
            const enhancedNotifications = notificationsData.map(notification => {
              if (notification.type === 'message' && messagesData && itemsData) {
                // Find the corresponding message and item
                const relatedMessage = messagesData.find(msg => 
                  new Date(msg.created_at).getTime() >= new Date(notification.created_at).getTime() - 5000 && // Within 5 seconds
                  new Date(msg.created_at).getTime() <= new Date(notification.created_at).getTime() + 5000
                );
                
                if (relatedMessage) {
                  const item = itemsData.find(item => item.id === relatedMessage.item_id);
                  return {
                    ...notification,
                    items: item
                  };
                }
              }
              return notification;
            });

            setNotifications(enhancedNotifications);
          } else {
            setNotifications(notificationsData);
          }
        } else {
          setNotifications(notificationsData);
        }
      }
    } catch (err) {
      console.error('Error in fetchNotifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
      } else {
        setNotifications(prev =>
          prev.map(notification =>
            notification.id === notificationId
              ? { ...notification, read: true }
              : notification
          )
        );
      }
    } catch (err) {
      console.error('Error in markAsRead:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user?.id)
        .eq('read', false);

      if (error) {
        console.error('Error marking all notifications as read:', error);
      } else {
        setNotifications(prev =>
          prev.map(notification => ({ ...notification, read: true }))
        );
      }
    } catch (err) {
      console.error('Error in markAllAsRead:', err);
    }
  };

  const handleNotificationClick = async (notification: EnhancedNotification) => {
    // Mark as read if not already read
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    // Navigate based on notification type
    if (notification.type === 'message') {
      navigate('/messages');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Notifications</h1>
          <p className="text-gray-600">
            {unreadCount > 0 
              ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'All caught up!'
            }
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead}>
            <Check className="h-4 w-4 mr-2" />
            Mark All as Read
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No notifications yet</h3>
            <p className="text-gray-600">
              When you have notifications, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <Card 
              key={notification.id} 
              className={`${notification.read ? 'opacity-75' : ''} ${notification.type === 'message' ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={() => notification.type === 'message' ? handleNotificationClick(notification) : undefined}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{notification.title}</h3>
                    {!notification.read && (
                      <Badge variant="destructive" className="text-xs">
                        New
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{formatDate(notification.created_at)}</span>
                    {!notification.read && notification.type !== 'message' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markAsRead(notification.id)}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-gray-600">
                  {notification.type === 'message' && notification.items
                    ? `You received a new message about "${notification.items.title}"`
                    : notification.message
                  }
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {notification.type}
                  </span>
                  {notification.type === 'message' && (
                    <div className="flex items-center text-xs text-blue-600">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Click to view message
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
