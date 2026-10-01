import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

// Use this hook in any page component instead of calling logout() directly.
// Example:
//   const handleLogout = useLogout();
//   <button onClick={handleLogout}>Log Out</button>

export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return () => {
    logout();
    navigate('/');
  };
}
