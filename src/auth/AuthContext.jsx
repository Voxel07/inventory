import { createContext, useContext, useEffect, useState } from "react";
import { Client, Account } from "appwrite";

// Initialize Appwrite client
const client = new Client()
  .setEndpoint("http://192.168.0.115/v1") // Replace with your Appwrite endpoint
  .setProject("67a52c90002b79ca0975"); // Replace with your Appwrite project ID

const account = new Account(client);

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Get the current session
        const session = await account.get();
        setUser(session);
      } catch (error) {
        // If no active session exists, user will be null
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Set up event listeners for auth state changes
    const unsubscribe = () => {
      // Listen for OAuth redirects
      const urlParams = new URLSearchParams(window.location.search);
      const userId = urlParams.get('userId');
      const secret = urlParams.get('secret');
      
      if (userId && secret) {
        // Handle callback from OAuth provider
        account.updateOAuth2Session(userId, secret)
          .then(() => checkSession())
          .catch(console.error);
      }
      
      const handleStorageChange = (e) => {
        if (e.key === 'appwrite-auth-change') {
          checkSession();
        }
      };
      
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    };

    const cleanup = unsubscribe();
    return () => cleanup;
  }, []);

  // Login with Authentik through Appwrite OAuth
  const loginWithAuthentik = async () => {
    try {
      // Get the current location to handle the redirect properly
      const currentLocation = window.location.href;
      
      // Initiate OAuth login with Authentik
      // The providerId should match what you set in Appwrite console
      account.createOAuth2Session('authentik', currentLocation, currentLocation);
      
      // Note: The above call will redirect the user, so no need to return anything
    } catch (error) {
      console.error('OAuth session creation failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await account.deleteSession('current');
      setUser(null);
      localStorage.setItem('appwrite-auth-change', Date.now().toString());
    } catch (error) {
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithAuthentik, logout, account, client }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);