import { useMemo } from "react";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from "@mui/material";
import { LineChart } from "@mui/x-charts";
import { createTheme, ThemeProvider } from "@mui/material";
import { styled } from '@mui/system';

const theme = createTheme({
  components: {
    MuiChart: {
      styleOverrides: {
        root: {
          "& .MuiChartsAxis-root": {
            stroke: "#f28e2c",
          },
          "& .MuiChartsTooltip-root": {
            backgroundColor: "#333",
            color: "#fff",
          },
        },
      },
    },
  },
});

const StyledPaper = styled(Paper)(({ theme }) => ({
    backgroundColor: '#090c11', // Semi-transparent white
    borderRadius: '5px',
    color:'#F5F0F3'
}));

const processStockChanges = (data) => {
  const sortedData = [...(data || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return sortedData.map((entry, index, arr) => {
    const previousStock = index > 0 ? arr[index - 1].stock : 0;
    return {
      change: entry.stock - previousStock,
      reason: entry.reason,
      timestamp: new Date(entry.created_at).toLocaleString(),
    };
  });
};

const StockHistoryChart = ({ stockData = [] }) => {
  const processedData = useMemo(() => {
    if (!Array.isArray(stockData) || stockData.length === 0) return { xAxis: [], yAxis: [] };
    const sortedData = [...stockData].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const stockHistory = sortedData.map((entry) => ({
      date: new Date(entry.created_at),
      stock: entry.stock,
    }));
    const maxStock = Math.max(...stockHistory.map((entry) => entry.stock));
    return {
      xAxis: stockHistory.map((entry) => entry.date),
      yAxis: stockHistory.map((entry) => entry.stock),
      maxStock: Math.ceil(maxStock * 1.1),
    };
  }, [stockData]);

  if (!Array.isArray(stockData) || stockData.length === 0) {
    return <div>No stock data available</div>;
  }

  return (
    <ThemeProvider theme={theme}>
      <LineChart
        xAxis={[{
          data: processedData.xAxis,
          scaleType: "time",
          valueFormatter: (date) => date.toLocaleDateString(),
          label: "Date",
          color: "#f28e2c",
        }]}
        yAxis={[{ max: processedData.maxStock }]} 
        series={[{
          data: processedData.yAxis,
          label: "Stock Quantity",
          area: false,
          color: "#f28e2c",
        }]}
        width={800}
        height={300}
        margin={{ left: 50, right: 50, top: 20, bottom: 30 }}
        tooltip={{ trigger: "item", backgroundColor: "#333", color: "#fff" }}
      />
    </ThemeProvider>
  );
};

const StockChangesTable = ({ stockData = [] }) => {
  const stockChanges = processStockChanges(stockData);
  return (
    <TableContainer component={StyledPaper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell><strong>Stock Change</strong></TableCell>
            <TableCell><strong>Reason</strong></TableCell>
            <TableCell><strong>Timestamp</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {stockChanges.map((row, index) => (
            <TableRow key={index}>
              <TableCell>{row.change}</TableCell>
              <TableCell>{row.reason}</TableCell>
              <TableCell>{row.timestamp}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

const StockOverview = ({ stockData = [] }) => {
  return (
    <div>
      <StockHistoryChart stockData={stockData} />
      <StockChangesTable stockData={stockData} />
    </div>
  );
};

export default StockOverview;
