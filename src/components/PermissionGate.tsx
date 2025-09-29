import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Mic, MapPin, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PermissionGateProps {
  children: React.ReactNode;
  userId: string;
}

const PermissionGate: React.FC<PermissionGateProps> = ({ children, userId }) => {
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [permissions, setPermissions] = useState({
    camera: false,
    microphone: false,
    location: false
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkExistingPermissions();
  }, [userId]);

  const checkExistingPermissions = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('permissions_granted')
        .eq('user_id', userId)
        .single();

      if (profile?.permissions_granted) {
        const granted = profile.permissions_granted as any;
        const allGranted = granted.camera && granted.microphone && granted.location;
        
        if (!allGranted) {
          setShowPermissionDialog(true);
        } else {
          startVerificationProcesses();
        }
      } else {
        setShowPermissionDialog(true);
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      setShowPermissionDialog(true);
    }
  };

  const requestPermissions = async () => {
    setLoading(true);
    const permissionResults = {
      camera: false,
      microphone: false,
      location: false
    };

    try {
      // Request camera and microphone access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      permissionResults.camera = true;
      permissionResults.microphone = true;
      
      // Stop the stream immediately
      mediaStream.getTracks().forEach(track => track.stop());

      // Request location access
      if ('geolocation' in navigator) {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              permissionResults.location = true;
              resolve(true);
            },
            reject,
            { timeout: 10000 }
          );
        });
      }

      setPermissions(permissionResults);
      
      if (permissionResults.camera && permissionResults.microphone && permissionResults.location) {
        await updatePermissionsInDatabase(permissionResults);
        setShowPermissionDialog(false);
        startVerificationProcesses();
        
        toast({
          title: "Permissions Granted",
          description: "All security features are now active"
        });
      } else {
        throw new Error('All permissions are required for platform security');
      }
    } catch (error: any) {
      toast({
        title: "Permission Error",
        description: error.message || "Failed to obtain required permissions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePermissionsInDatabase = async (perms: typeof permissions) => {
    await supabase
      .from('profiles')
      .update({ permissions_granted: perms })
      .eq('user_id', userId);
  };

  const startVerificationProcesses = () => {
    // Start image capture every 10 minutes
    setInterval(captureVerificationImage, 10 * 60 * 1000);
    
    // Start location tracking every 10 minutes
    setInterval(trackLocation, 10 * 60 * 1000);
    
    // Initial captures
    setTimeout(captureVerificationImage, 5000);
    setTimeout(trackLocation, 2000);
  };

  const captureVerificationImage = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      video.onloadedmetadata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        
        canvas.toBlob(async (blob) => {
          if (blob) {
            const fileName = `verification_${userId}_${Date.now()}.jpg`;
            
            // Upload to Supabase storage
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('verification-images')
              .upload(fileName, blob);

            if (!uploadError && uploadData) {
              // Save record to database
              await supabase.from('verification_images').insert({
                user_id: userId,
                image_url: uploadData.path,
                metadata: { auto_captured: true }
              });
            }
          }
          
          // Stop the stream
          stream.getTracks().forEach(track => track.stop());
        }, 'image/jpeg', 0.8);
      };
    } catch (error) {
      console.error('Failed to capture verification image:', error);
    }
  };

  const trackLocation = async () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await supabase.from('location_tracking').insert({
            user_id: userId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            metadata: { auto_tracked: true }
          });
        },
        (error) => console.error('Location tracking error:', error)
      );
    }
  };

  if (showPermissionDialog) {
    return (
      <Dialog open={showPermissionDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Security Verification Required
            </DialogTitle>
            <DialogDescription>
              For platform security and bot prevention, we need access to the following:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Camera className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Camera Access</p>
                  <p className="text-sm text-muted-foreground">
                    Automatic verification photos every 10 minutes
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Mic className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Microphone Access</p>
                  <p className="text-sm text-muted-foreground">
                    Voice verification for security purposes
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Location Access</p>
                  <p className="text-sm text-muted-foreground">
                    Location tracking every 10 minutes for verification
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="agree" 
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked as boolean)}
              />
              <label htmlFor="agree" className="text-sm">
                I agree to the security verification requirements
              </label>
            </div>

            <Button 
              onClick={requestPermissions}
              disabled={!agreed || loading}
              className="w-full"
            >
              {loading ? 'Requesting Permissions...' : 'Grant Permissions & Continue'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return <>{children}</>;
};

export default PermissionGate;