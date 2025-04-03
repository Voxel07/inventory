import React, { useEffect, useState, useRef, useContext, useCallback } from 'react'; // Added useContext, useCallback
import { TableCell, Table, TableBody, TableContainer, TableHead, TableRow, CircularProgress, Typography } from '@mui/material'; // Added loading/error components
import { IconButton, Paper } from '@mui/material/';
import DeleteIcon from '@mui/icons-material/Delete';
import LaunchIcon from '@mui/icons-material/Launch';
import { styled } from '@mui/system';
import Stack from "@mui/material/Stack";
import { useNavigate } from 'react-router-dom';

// --- 1. Import Appwrite client instances and Query ---
import { client, databases } from 'src/utils/appwriteClient'; // Adjust path if needed
import { Query } from 'appwrite';

import AddEntry from 'src/components/AddEntry'


// Feedback
import { AlertsManager, AlertsContext } from 'src/utils/AlertsManager';

// --- 2. Appwrite Configuration (Replace or use Environment Variables) ---
const DATABASE_ID = '67a54e42001855e41827'; // <-- REPLACE
const ITEMS_COLLECTION_ID = '67ef0bb20039030dc0da';
const STOCK_COLLECTION_ID = '67ef0c050009ca72b3c8';
const STOCK_ITEM_ID_ATTRIBUTE = 'item'; // <-- REPLACE with the actual attribute linking stock to items (e.g., 'itemId', 'item')
const STOCK_CREATED_AT_ATTRIBUTE = 'timestamp'; // Use '$timestamp' or your custom date attribute for sorting stock
const ITEM_STOCK_VALUE_ATTRIBUTE = 'stock'; // <-- REPLACE with the actual attribute name holding the stock count in the 'stock' collection
// --------------------------------------------------------------------

const StyledPaper = styled(Paper)(({ theme }) => ({ // Added theme access
    backgroundColor: '#090c11',
    borderRadius: '5px',
    color: '#F5F0F3',
    overflowX: 'auto', // Handle potential horizontal overflow
    [theme.breakpoints.up('md')]: { // Example: Apply minWidth only on medium screens and up
         minWidth: '800px',
    },
     [theme.breakpoints.up('lg')]: {
         minWidth: '1200px',
    }
}));

const Items = () => {
    const alertsManagerRef = useRef(null); // Initialize ref with null
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const contextAlertsManager = useContext(AlertsContext); // Get manager from context

    // Assign context manager to ref once available
    useEffect(() => {
        alertsManagerRef.current = contextAlertsManager;
    }, [contextAlertsManager]);

    // --- Helper function to show alerts safely ---
    const showAlert = (severity, title, message = '') => {
        if (alertsManagerRef.current) {
            alertsManagerRef.current.showAlert(severity, title, message);
        } else {
            console.warn("AlertsManager ref not ready, logging to console:", { severity, title, message });
        }
    };

    // --- 3. Memoized fetchStockForItem using useCallback ---
    // Ensures the function identity is stable unless dependencies change
    const fetchStockForItem = useCallback(async (itemId) => {
        // Fetches latest stock entries for an item
        try {
            const response = await databases.listDocuments(
                DATABASE_ID,
                STOCK_COLLECTION_ID,
                [
                    Query.equal(STOCK_ITEM_ID_ATTRIBUTE, itemId),
                    Query.orderDesc(STOCK_CREATED_AT_ATTRIBUTE), // Sort by creation date/time
                    Query.limit(1)
                ]
            );
            // Map needed fields, assuming ITEM_STOCK_VALUE_ATTRIBUTE holds the count
            return response.documents.map(doc => ({
                ...doc, // Include all doc fields if needed elsewhere
                stockValue: doc[ITEM_STOCK_VALUE_ATTRIBUTE], // Map the specific stock value field
                timestamp: doc.$timestamp // Keep track of creation time if needed
            }));
        } catch (error) {
            console.error(`Error fetching stock data for item ${itemId}:`, error);
            // Don't show alert for every failed stock fetch, maybe log it
            return []; // Return empty array on error
        }
    }, [STOCK_ITEM_ID_ATTRIBUTE, STOCK_CREATED_AT_ATTRIBUTE]); // Dependencies: IDs are constants, only attribute names matter


    // --- 4. Initial Data Fetch ---
    const fetchInitialItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch all items
            const response = await databases.listDocuments(
                DATABASE_ID,
                ITEMS_COLLECTION_ID,
                [Query.limit(1000)] // Add a limit; default is 25. Adjust as needed.
            );

            // Map base item data
            const itemsData = response.documents.map(doc => ({
                ...doc,
                id: doc.$id,
                stock: [], // Initialize stock array
                latestStock: null // Initialize latest stock object
            }));

            // *Performance Note*: Fetching stock for each item (N+1 queries).
            const itemsWithStock = await Promise.all(
                itemsData.map(async (item) => {
                    const stockData = await fetchStockForItem(item.id);
                    return {
                        ...item,
                        stock: stockData, // Store the fetched array (up to 20 entries)
                        // --- 5. Simplified latestStock ---
                        latestStock: stockData.length > 0 ? stockData[0] : null // First element is the latest due to query sorting
                    };
                })
            );

            setItems(itemsWithStock);
            // Don't show success alert on initial load unless desired
            // showAlert('success', 'Items fetched successfully');

        } catch (err) {
            console.error('Error fetching initial items:', err);
            setError(err.message || 'Failed to load items.');
            showAlert('error', 'Error fetching items', err.message);
        } finally {
            setLoading(false);
        }
    }, [fetchStockForItem, showAlert]); // Dependency includes fetchStockForItem & showAlert

    // --- Effect for Initial Fetch ---
    useEffect(() => {
        fetchInitialItems();
    }, []); // Run only when fetchInitialItems function identity changes


    // --- 6. Real-time Subscription Effect ---
    useEffect(() => {
        const subscriptionChannel = `databases.${DATABASE_ID}.collections.${ITEMS_COLLECTION_ID}.documents`;

        const unsubscribe = client.subscribe(subscriptionChannel,
            async (response) => { // Make the callback async to await fetchStockForItem
                const event = response.events[0]; // Get the specific event type
                const payload = response.payload;

                // --- Handle Create ---
                 if (event.endsWith('.create')) {
                    console.log('Realtime: Item Created', payload);
                    // Fetch stock for the newly created item
                    const stockData = await fetchStockForItem(payload.$id);
                    const latestStock = stockData.length > 0 ? stockData[0] : null;
                    setItems(prevItems => {
                        // Avoid adding duplicates if create event fires multiple times quickly
                        if (prevItems.some(item => item.id === payload.$id)) {
                            return prevItems;
                        }
                        return [
                            ...prevItems,
                            { ...payload, id: payload.$id, stock: stockData, latestStock: latestStock }
                        ];
                    });
                 }
                 // --- Handle Update ---
                 else if (event.endsWith('.update')) {
                    console.log('Realtime: Item Updated', payload);
                     // Re-fetch stock data for the updated item
                     const stockData = await fetchStockForItem(payload.$id);
                     const latestStock = stockData.length > 0 ? stockData[0] : null;
                    setItems(prevItems =>
                        prevItems.map(item =>
                            item.id === payload.$id
                                ? { ...payload, id: payload.$id, stock: stockData, latestStock: latestStock }
                                : item
                        )
                    );
                 }
                 // --- Handle Delete ---
                 else if (event.endsWith('.delete')) {
                     console.log('Realtime: Item Deleted', payload);
                    setItems(prevItems =>
                        prevItems.filter(item => item.id !== payload.$id)
                    );
                 }
            }
        );

        console.log(`Subscribed to Appwrite channel: ${subscriptionChannel}`);

        // Cleanup subscription on component unmount
        return () => {
            console.log(`Unsubscribing from Appwrite channel: ${subscriptionChannel}`);
            unsubscribe();
        };
        // Dependencies: client, fetchStockForItem. Assuming IDs are constants.
    }, [client, fetchStockForItem]); // Re-subscribe if client or fetch function changes


    // --- 7. Delete Handler ---
    const handleDelete = async (id, name) => {
         // Optional: Ask for confirmation
         if (!window.confirm(`Are you sure you want to delete item "${name}" (${id}) and all its stock history? This cannot be undone.`)) {
             return;
         }

        try {
            // *Performance Note*: Deleting stock entries one by one.
            console.log(`Attempting to delete stock entries for item ${id}`);
            const stockResponse = await databases.listDocuments(
                DATABASE_ID,
                STOCK_COLLECTION_ID,
                [
                    Query.equal(STOCK_ITEM_ID_ATTRIBUTE, id),
                    Query.limit(5000) // Fetch up to 5000 stock docs to delete (adjust if needed, Appwrite max limit)
                ]
            );

            if (stockResponse.documents.length > 0) {
                 // Delete each stock document
                await Promise.all(stockResponse.documents.map(stockDoc =>
                    databases.deleteDocument(
                        DATABASE_ID,
                        STOCK_COLLECTION_ID,
                        stockDoc.$id
                    )
                ));
                 console.log(`Deleted ${stockResponse.documents.length} stock entries for item ${id}`);
            } else {
                 console.log(`No stock entries found for item ${id} to delete.`);
            }

            // Then delete the main item
            console.log(`Attempting to delete item ${id}`);
            await databases.deleteDocument(
                DATABASE_ID,
                ITEMS_COLLECTION_ID,
                id
            );
             console.log(`Successfully deleted item ${id}`);

            // State update is handled by the real-time listener, but can force it here too
            // setItems(prevItems => prevItems.filter(item => item.id !== id));
            showAlert('success', `Item "${name}" deleted successfully`);

        } catch (err) {
            console.error(`Delete error for item ${id}:`, err);
            showAlert('error', `Error deleting item "${name}"`, err.message);
        }
    };

    // --- 8. Redirect Handler ---
    const handleRedirect = (id) => {
        // Using relative path which is generally safer with React Router
        navigate(`../item/${id}`); // Go up one level (from /items) then to /item/:id
    };

    // --- Loading and Error States ---
     if (loading) {
        return (
            <StyledPaper style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                <CircularProgress />
            </StyledPaper>
        );
    }

    if (error) {
        return (
             <StyledPaper style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', padding: '20px' }}>
                <Typography color="error">Error loading items: {error}</Typography>
            </StyledPaper>
        );
    }

    // --- 9. Render Table ---
    return (
        <TableContainer component={StyledPaper}>
            {/* Render AlertsManager via context, assuming it's provided higher up */}
            {/* <AlertsManager ref={alertsManagerRef} /> */}
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        {/* Adjust headers based on your actual item attributes */}
                        <TableCell sx={{ color: '#F5F0F3', backgroundColor: '#1a1d21' }}>Name</TableCell>
                        <TableCell sx={{ color: '#F5F0F3', backgroundColor: '#1a1d21' }}>Stock</TableCell>
                        <TableCell sx={{ color: '#F5F0F3', backgroundColor: '#1a1d21' }}>Lagerort</TableCell>
                        <TableCell sx={{ color: '#F5F0F3', backgroundColor: '#1a1d21' }}>Lagerposition</TableCell>
                        <TableCell sx={{ color: '#F5F0F3', backgroundColor: '#1a1d21' }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.length === 0 && !loading ? (
                        <TableRow>
                            <TableCell colSpan={6} align="center">No items found.</TableCell>
                        </TableRow>
                    ) : (
                        items.map((item) => (
                            <TableRow key={item.id} hover>
                                <TableCell>{item.name ?? 'N/A'}</TableCell> {/* Use nullish coalescing for safety */}
                                <TableCell>
                                    {/* --- 10. Display latest stock value --- */}
                                    {item.latestStock ? item.latestStock.stock : 'N/A'}
                                </TableCell>
                                <TableCell>{item.location ?? 'N/A'}</TableCell>
                                <TableCell>{item.position ?? 'N/A'}</TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={0} alignItems="center">
                                        <IconButton title="View Details" size="small" color="info" onClick={() => handleRedirect(item.id)}><LaunchIcon/></IconButton>
                                        {/* <AddEntry action={"update"} ItemToModify={item}/> */}
                                        <IconButton title="Delete Item" size="small" onClick={() => handleDelete(item.id, item.name)} color="error"><DeleteIcon/></IconButton>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
            {/* Add pagination controls here if needed */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            {/* <pre>{JSON.stringify(items, null, 2)}</pre> */}
                {/* Add button or component for adding new items */}
                <AddEntry action={"add"} />
            </div>
        </TableContainer>
    );
};

export default Items;