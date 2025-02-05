import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>; // Prevents flashing the login page

  return user ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;
