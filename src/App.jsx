import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material';

//Auth
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./auth/Login";
import SignUp from "./auth/SignUp";

//Pages
import Inventry from './pages/inventory';
import ItemPage from './pages/itemPage';

const theme = createTheme({
  components: {
    MuiTypography: {
      styleOverrides: {
        h1: { color: '#f5f0f3' },
        h2: { color: '#f5f0f3' },
        h3: { color: '#f5f0f3' },
        h4: { color: '#f5f0f3' },
        h5: { color: '#f5f0f3' },
       p: { color: '#f5f0f3' },
       subtitle1: {color :'#f5f0f3'},
       body1: { color: '#f5f0f3' },
       body2: { color: '#f5f0f3' },
      },
    },
    MuiTextField: { 
      styleOverrides: {
        root: { 
          '& .MuiInputLabel-root': { color: '#DDDDDD' },
          '& .MuiOutlinedInput-root': { 
            color: '#DDDDDD',
            '& > fieldset': { borderColor: '#DDDDDD' },
          },
        },
      },
    },
    MuiInputAdornment: {
        styleOverrides: {
            root: {
                '& .MuiTypography-root': { color: '#DDDDDD' },
            },
        },
    },
    // MuiButton: {
    //   styleOverrides: {
    //     root: {
    //       // backgroundColor: 'lightblue', 
    //       color: '#f5f0f3',
    //       borderColor: '#1998a1',
    //       // backgroundColor: '#2d686d',
    //       '&:hover': {
    //         backgroundColor: '#1998a1',
    //         color: '#f5f0f3',
    //       },
    //     },
    //   },
    // },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '& .MuiSvgIcon-root': {
            // color: 'red',
          },
          '&:hover': {
            '& .MuiSvgIcon-root': {
              color: '#a64913',
            },
          },
        },
      },
    },
    MuiTab: {
          styleOverrides: {
              root: {
                  '&.Mui-selected': {
                      color: '#a64913', // color for active tab
                      '& .MuiSvgIcon-root': {
                          color: '#a64913',
                      },
                  },
                  color: '#083036', // color for inactive tab
                },
          },
      },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#a64913',
        },
      }
    },
    MuiTableBody: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root:nth-of-type(odd)': { 
              backgroundColor: '#151c28', 
          },
          '& .MuiTableRow-root:nth-of-type(even)': { 
          backgroundColor: '#090c11' ,
          },
          '& .MuiTableRow-root': { 

          },
          '& .MuiTableCell-root' : {
              borderBottom: '1px solid #19669d',
          }
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
              color: '#F5F0F3', // set alternating colors for even and odd rows
              borderBottom: '3px solid #F5F0F3',
            },
          },
      },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#1998a1', // Change this to your desired color
          "&::before, &::after": {
            borderColor: "#1998a1",
          },
        },
      },
    },
  },
});

function App() {
  return (
    <AuthProvider>
      <ThemeProvider theme={theme}>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Inventry />
                </ProtectedRoute>
              }
            />
            <Route
              path="/item/:id"
              element={
                <ProtectedRoute>
                  <ItemPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App
