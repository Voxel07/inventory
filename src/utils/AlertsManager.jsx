
import { useState, forwardRef, useEffect, useImperativeHandle, createContext } from 'react';
import Alert from '@mui/material/Alert';
import Slide from '@mui/material/Slide';
import  LinearProgress  from '@mui/material/LinearProgress';
//styling
import './AlertsManager.css';
const AlertsContext = createContext();

const tiemoutDuration = 4000

const AlertsManager = forwardRef(function AlertsManager(props, ref) {
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
      const interval = setInterval(() => {
        setAlerts((prevAlerts) =>
          prevAlerts.map((alert) => ({
            ...alert,
            remainingTime: Math.max(alert.remainingTime - 100, 0),
          }))
        );
      }, 100);
      return () => clearInterval(interval);
    }, []);


    // Function to add an alert to the state
    const showAlert = (severity, message) => {
      const id = new Date().getTime();
      setAlerts((prevAlerts) => [
        ...prevAlerts,
        { id, severity, message, remainingTime: tiemoutDuration },
      ]);
      if (alerts.length >= 5) {
        removeAlert(alerts[0].id);
      }
    };

    // Function to remove an alert from the state
    const removeAlert = (id) => {
      setAlerts((prevAlerts) => prevAlerts.filter((alert) => alert.id !== id));
    };

    useImperativeHandle(ref, () => ({
      showAlert,
    }));

    return (
      // Render the alerts
      <div className='alerts-manager'>
        {alerts.map((alert) => (
      <Slide
        key={alert.id}
        direction="left"
        in={true}
        mountOnEnter
        unmountOnExit
        onEnter={() => {
          setTimeout(() => {
            removeAlert(alert.id);
          }, tiemoutDuration);
        }}
      >
        <div style={{position: 'relative'}}>
        <Alert
          severity={alert.severity}
          onClose={() => removeAlert(alert.id)}
          sx={{ mb: 1 }}
        >
          {alert.message}
        </Alert>
            <LinearProgress
              variant="determinate"
              color={alert.severity}
              value={100 - ((alert.remainingTime - 340)/ tiemoutDuration) * 100}
              style={{
                position: 'absolute',
                bottom: 8,
                left: 0,
                width: '100%',
                borderBottomRightRadius: 2,
                borderBottomLeftRadius: 2,
              }}
            />

            </div>
      </Slide>
    ))}
      </div>
    );
  });
export { AlertsManager, AlertsContext };