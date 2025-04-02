import { useParams } from 'react-router-dom';
// 1. Import the configured Appwrite databases client
import { databases } from 'src/utils/appwriteClient'; // Assuming this path is correct
// 1.1 Import Query class for filtering
import { Query } from 'appwrite';
import { useEffect, useState } from 'react';
import { Paper, CircularProgress, Typography } from '@mui/material'; // Added loading/error components

//layout
import Grid from '@mui/material/Grid2';

//styles
import { styled } from '@mui/system';

//charts
import StockHistoryChart from 'src/components/StockHistoryChart';

//qr code
import QRCodeGenerator from "src/components/QrCode";

// --- Appwrite Configuration (Replace with your actual IDs) ---
// It's highly recommended to store these in environment variables
const DATABASE_ID = 'YOUR_DATABASE_ID'; // <-- REPLACE
const ITEMS_COLLECTION_ID = 'items'; // <-- REPLACE or confirm collection name/ID
const STOCK_COLLECTION_ID = 'stock'; // <-- REPLACE or confirm collection name/ID
// Assumes the 'stock' collection has an attribute (e.g., 'itemId')
// that stores the ID of the related item document.
const STOCK_ITEM_ID_ATTRIBUTE = 'itemId'; // <-- REPLACE with the actual attribute name if different
// -------------------------------------------------------------

const StyledPaper = styled(Paper)(() => ({
    backgroundColor: '#242424',
    border: '1px solid #0a152f',
    borderRadius: '5px',
    color:'#F5F0F3',
    minWidth: '400px', // Consider responsiveness if needed
    minHeight: '200px',
    display: 'flex', // Added for centering content
    justifyContent: 'center', // Added for centering content
    alignItems: 'center', // Added for centering content
    padding: '16px', // Added padding
    boxSizing: 'border-box', // Ensure padding is included in dimensions
}));


const ItemPage = () => {
  const { id } = useParams(); // This 'id' should be the Appwrite Document ID for the item
  const [item, setItem] = useState(null); // Initialize with null for an object
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchItemAndStock = async () => {
    if (!id) {
        setError("No item ID provided in URL.");
        setLoading(false);
        return;
    }

    setLoading(true);
    setError(null);
    setItem(null); // Reset item on new fetch

    try {
      // 2. Fetch the single item document using its ID
      const itemDocument = await databases.getDocument(
        DATABASE_ID,
        ITEMS_COLLECTION_ID,
        id // Use the id from useParams as the Appwrite Document ID
      );

      // 3. Fetch the related stock documents
      // Query the 'stock' collection where STOCK_ITEM_ID_ATTRIBUTE equals the item's ID
      const stockResponse = await databases.listDocuments(
        DATABASE_ID,
        STOCK_COLLECTION_ID,
        [
          Query.equal(STOCK_ITEM_ID_ATTRIBUTE, id), // Filter by the item's ID
          // Query.orderDesc('$createdAt'), // Optional: Order stock history if needed
          // Query.limit(100) // Optional: Add limit if stock history can be large
        ]
      );

      // 4. Combine the item data and its stock data
      setItem({
        ...itemDocument, // Spread all attributes from the item document
        id: itemDocument.$id, // Explicitly map Appwrite's $id if needed, or use your own unique ID attribute
        stock: stockResponse.documents, // Assign the fetched stock documents
      });

    } catch (err) {
      console.error("Failed to fetch item data:", err);
      setError(err.message || 'An error occurred while fetching data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItemAndStock();
    // Re-run the effect if the id from the URL changes
  }, [id]);


  // 5. Handle Loading and Error States
  if (loading) {
    return (
        <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '80vh' }}>
            <CircularProgress />
        </Grid>
    );
  }

  if (error) {
    return (
        <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '80vh' }}>
            <StyledPaper>
                <Typography color="error">Error: {error}</Typography>
            </StyledPaper>
        </Grid>
    );
  }

  if (!item) {
     return (
        <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '80vh' }}>
             <StyledPaper>
                <Typography>Item not found.</Typography>
            </StyledPaper>
        </Grid>
    );
  }

  // 6. Render the data (use optional chaining `?.` for safety if needed)
  return(
    <Grid container spacing={2}>
      <Grid item xs={12} sm={1}> {/* Adjusted grid for responsiveness */}
        <StyledPaper>{item.id}</StyledPaper> {/* Use item.$id if you rely on Appwrite's internal ID */}
      </Grid>
      <Grid item xs={12} sm={6}> {/* Adjusted grid for responsiveness */}
        <StyledPaper>{item.name}</StyledPaper> {/* Make sure 'name' is an attribute in your 'items' collection */}
      </Grid>
      <Grid item xs={12} sm={5}> {/* Adjusted grid for responsiveness */}
        <StyledPaper>
          <div style={{ height: "auto", margin: "0 auto", maxWidth: 180, width: "100%" }}> {/* Reduced max QR size slightly */}
            <QRCodeGenerator
                size={256} // Keep rendering size large for detail
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                value={window.location.href}
                viewBox={`0 0 256 256`}
                level="H" // Consider adding error correction level
            />
          </div>
        </StyledPaper>
      </Grid>
      <Grid item xs={12}>
        {/* Ensure StockHistoryChart expects an array of stock documents */}
        {item.stock && item.stock.length > 0 ? (
            <StockHistoryChart stockData={item.stock}/>
        ) : (
            <StyledPaper>
                <Typography>No stock history available.</Typography>
            </StyledPaper>
        )}
      </Grid>

      {/* Optional: Debug output */}
      {/* <Grid item xs={12}>
         <pre>{JSON.stringify(item, null, 2)}</pre>
      </Grid> */}
    </Grid>
    )


}

export default ItemPage;