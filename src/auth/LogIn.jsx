import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const { loginWithAuthentik, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if the user is already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await loginWithAuthentik();
      // Note: The user will be redirected to Authentik's login page,
      // so the following code won't execute immediately
    } catch (error) {
      setError("Failed to initialize login with Authentik. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Login</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleLogin}>
        <button type="submit" disabled={loading}>
          {loading ? "Connecting..." : "Login"}
        </button>
      </form>
    </div>
  );
};

export default Login;