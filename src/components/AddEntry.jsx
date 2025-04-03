import React, { useEffect, useState, useRef, useContext } from 'react'; // Added useContext
import Fade from '@mui/material/Fade';
// Form
import { Formik, Field, Form } from 'formik';
import * as yup from 'yup';

// MUI
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import Backdrop from '@mui/material/Backdrop';
import Modal from '@mui/material/Modal';
import Button from '@mui/material/Button';
import { Container, Typography } from '@mui/material';
// import InputAdornment from '@mui/material/InputAdornment'; // Not used in form
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import Stack from "@mui/material/Stack";
// import Autocomplete from '@mui/material/Autocomplete'; // Not used in form
import CloseIcon from '@mui/icons-material/Close';
import { IconButton } from '@mui/material/';
// import ClearIcon from '@mui/icons-material/Clear'; // Not used in form
// import { createTheme, ThemeProvider } from '@mui/material'; // Theme not applied here, remove if unused

// --- 1. Appwrite Imports ---
import { databases, ID } from 'src/utils/appwriteClient'; // Adjust path as needed

// Feedback
import { AlertsManager, AlertsContext } from 'src/utils/AlertsManager';

// --- 2. Appwrite Configuration (Use Constants or Environment Variables) ---
const DATABASE_ID = '67a54e42001855e41827'; // <-- REPLACE
const ITEMS_COLLECTION_ID = '67ef0bb20039030dc0da';
const STOCK_COLLECTION_ID = '67ef0c050009ca72b3c8';
// Attribute in 'stock' collection linking to an item's $id
const STOCK_ITEM_ID_ATTRIBUTE = 'item'; // <-- REPLACE if different
// Attribute in 'stock' collection holding the stock count
const ITEM_STOCK_VALUE_ATTRIBUTE = 'stock'; // <-- REPLACE if different (e.g., 'quantity', 'count')
// -----------------------------------------------------------------------

const style = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)', // Adjusted for better centering
    width: { xs: '90%', sm: '70%', md: '500px' }, // Responsive width
    bgcolor: '#090c11', // Use bgcolor for background color
    border: '2px solid #000',
    boxShadow: 24, // Use theme's shadow system
    p: 4, // Padding
    borderRadius: '16px', // Consistent border radius
    color: '#F5F0F3', // Set default text color
    maxHeight: '90vh', // Prevent modal from exceeding viewport height
    overflowY: 'auto', // Allow scrolling if content overflows
};

// Component Rename: Changed from AddProduct to AddEntry for consistency
const AddEntry = ({ action, ItemToModify }) => {
    const alertsManagerRef = useRef(null); // Initialize ref with null
    const contextAlertsManager = useContext(AlertsContext); // Get manager from context
    const [open, setOpen] = useState(false);
    const nameRef = useRef(); // For focusing the name field

    // Assign context manager to ref once available
    useEffect(() => {
        alertsManagerRef.current = contextAlertsManager;
    }, [contextAlertsManager]);

     // Helper function to show alerts safely
    const showAlert = (severity, title, message = '') => {
        if (alertsManagerRef.current) {
            alertsManagerRef.current.showAlert(severity, title, message);
        } else {
            console.warn("AlertsManager ref not ready, logging to console:", { severity, title, message });
        }
    };

    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);

    // --- 3. Appwrite Function to Add Stock Entry ---
    const addStock = async (itemId, newStockValue) => {
        // Ensure newStockValue is a number if your schema expects it
        const stockValue = Number(newStockValue);
        if (isNaN(stockValue)) {
             showAlert('error', 'Invalid Stock Value', 'Stock must be a number.');
             return false; // Indicate failure
        }

        const newStockData = {
            [STOCK_ITEM_ID_ATTRIBUTE]: itemId, // e.g., itemId: "..."
            [ITEM_STOCK_VALUE_ATTRIBUTE]: stockValue, // e.g., stock: 10
            timestamp: (new Date()).toISOString(),
            reason:"restock"
            // Add any other required fields for the stock collection here
        };

        try {
            const document = await databases.createDocument(
                DATABASE_ID,
                STOCK_COLLECTION_ID,
                ID.unique(), // Generate unique ID for the stock entry
                newStockData
            );
            console.log('Stock added:', document);
            showAlert('success', 'Stock entry added successfully');
            return true; // Indicate success
        } catch (error) {
            console.error('Error adding stock:', error);
            showAlert('error', 'Error Adding Stock Entry', error.message);
            return false; // Indicate failure
        }
    };


    // --- 4. Appwrite Function to Add Item and Initial Stock ---
    const addEntry = async (values) => {
        const newItemData = {
            name: values.name,
            location: values.location,
            position: values.position,
            // Add any other required fields for the items collection
        };

        try {
            // Create the item document
            const itemDocument = await databases.createDocument(
                DATABASE_ID,
                ITEMS_COLLECTION_ID,
                ID.unique(), // Generate unique ID for the item
                newItemData
            );
            console.log('Item added:', itemDocument);
            showAlert('success', 'Item added successfully');

            // Add the initial stock entry using the new item's ID
            const stockAdded = await addStock(itemDocument.$id, values.stock);

             if (stockAdded) {
                handleClose(); // Close modal only if both succeed
                return true;
            }


        } catch (error) {
            console.error('Error adding item:', error);
            showAlert('error', 'Error Adding Item', error.message);
            return false;
        }
         return false; // Return false if stock addition failed after item creation
    };

    // --- 5. Appwrite Function to Update Item and Add Stock Entry if Changed ---
    const updateEntry = async (values) => {
         // Ensure ItemToModify and latestStock exist
        if (!ItemToModify?.latestStock) {
             showAlert('error', 'Error', 'Cannot update item without existing data.');
            return false;
        }

        let itemUpdated = false;
        let stockAdded = false;
        let needsItemUpdate = false;
        let needsStockUpdate = false;

        const dataToUpdate = {};

        // Check which item fields changed
        ['name', 'location', 'position'].forEach(field => {
            if (ItemToModify[field] !== values[field]) {
                dataToUpdate[field] = values[field];
                needsItemUpdate = true;
            }
        });

        // Check if stock value changed (compare with the numeric value from latestStock)
        const currentStockValue = Number(ItemToModify.latestStock[ITEM_STOCK_VALUE_ATTRIBUTE]);
        const newStockValue = Number(values.stock);

        if (isNaN(currentStockValue) || isNaN(newStockValue)) {
             showAlert('error', 'Invalid Stock Value', 'Stock must be a numeric value.');
            return false;
        }


        if (currentStockValue !== newStockValue) {
             needsStockUpdate = true;
        }


        if (!needsItemUpdate && !needsStockUpdate) {
            showAlert('info', 'No Changes Detected', 'No fields were modified.');
            return true; // No changes, considered "successful" in terms of operation
        }

        // Perform Item Update if needed
        if (needsItemUpdate) {
            try {
                await databases.updateDocument(
                    DATABASE_ID,
                    ITEMS_COLLECTION_ID,
                    ItemToModify.id, // Should be the $id from the item fetched previously
                    dataToUpdate
                );
                showAlert('success', 'Item details updated successfully');
                itemUpdated = true;
            } catch (error) {
                console.error('Error updating item:', error);
                showAlert('error', 'Error Updating Item', error.message);
                // Decide if you want to stop here or proceed to stock update
                // return false; // Option: Stop if item update fails
            }
        } else {
             itemUpdated = true; // No item update needed counts as success for this part
        }


        // Perform Stock Add if needed
        if (needsStockUpdate) {
             // Use the existing addStock function which creates a new entry
             stockAdded = await addStock(ItemToModify.id, values.stock);
        } else {
             stockAdded = true; // No stock update needed counts as success for this part
        }

        if ((needsItemUpdate && itemUpdated) || (needsStockUpdate && stockAdded) || (!needsItemUpdate && !needsStockUpdate)) {
            handleClose(); // Close modal if relevant operations succeeded or no ops needed
            return true;
        } else {
            // If item update succeeded but stock failed, or vice versa (and update was needed)
             showAlert('warning', 'Partial Success', 'Some updates may not have completed.');
             return false;
        }

    };

    // --- 6. Form Submission Logic ---
    const handleSubmit = async (values, { setSubmitting, resetForm }) => {
        setSubmitting(true);
        let success = false;
        if (action === "add") {
            success = await addEntry(values);
        } else if (action === "update") {
             success = await updateEntry(values);
        }
        setSubmitting(false);

        if (success && action === "add") {
            resetForm(); // Optionally reset form on successful add
            // handleClose(); // Moved inside add/update functions for better control
        } else if (success && action === "update") {
             // handleClose(); // Moved inside add/update functions
        }
    };

    // --- 7. Validation Schema (Adjust messages as needed) ---
    const validationSchema = yup.object().shape({
        name: yup.string().required("Name is required").min(4, "Min. 4 characters").max(50, "Max. 50 characters"), // Increased max length
        // Ensure stock validation aligns with ITEM_STOCK_VALUE_ATTRIBUTE type (likely number)
        stock: yup.number()
            .required("Stock count is required")
            .integer("Must be a whole number")
            .typeError("Must be a number")
            .min(0, "Stock cannot be negative"), // Allow 0 stock
        location: yup.string().max(50, "Max 50 chars").nullable(), // Allow empty optional fields
        position: yup.string().max(50, "Max 50 chars").nullable(), // Allow empty optional fields
    });

    // --- Initial Values ---
     const initialFormValues = ItemToModify
        ? {
              name: ItemToModify.name ?? '',
              // --- 8. Use correct attribute for initial stock value ---
              stock: ItemToModify.latestStock ? ItemToModify.latestStock[ITEM_STOCK_VALUE_ATTRIBUTE] ?? 0 : 0,
              position: ItemToModify.position ?? '',
              location: ItemToModify.location ?? '',
          }
        : {
              name: '',
              stock: '', // Start empty for new entries
              position: '',
              location: '',
          };


    return (
        <div>
            {/* The AlertsManager component should ideally live higher up in your component tree
                and be provided via Context, rather than instantiating here.
                Assuming AlertsContext provides the manager instance used by alertsManagerRef. */}
            {/* <AlertsManager ref={alertsManagerRef} /> */}

            {action === "add" ? (
                <Button variant="outlined" startIcon={<AddIcon />} onClick={handleOpen}>Add New Item</Button >
            ) : (
                <IconButton title="Edit Item" size="small" variant="contained" color="warning" onClick={handleOpen}><EditIcon /></IconButton>
            )}

            <Modal
                aria-labelledby="transition-modal-title"
                aria-describedby="transition-modal-description"
                open={open}
                onClose={handleClose} // Allow closing by clicking backdrop
                closeAfterTransition
                slots={{ backdrop: Backdrop }}
                slotProps={{
                    backdrop: {
                        timeout: 500,
                    },
                }}
            >
                {/* Use standard Formik */}
                <Formik
                    validateOnChange={true}
                    initialValues={initialFormValues}
                    validationSchema={validationSchema}
                    onSubmit={handleSubmit}
                >
                    {({ values, errors, isSubmitting, touched, setFieldValue }) => (
                        <Container sx={style} >
                            <Typography id="transition-modal-title" variant="h6" component="h2" sx={{ mb: 3 }}>
                                {action === "add" ? "Add New Item" : "Update Item"}
                            </Typography>

                            <Form noValidate> {/* Add noValidate to prevent browser default validation */}
                                <Grid container spacing={2}>
                                    <Grid xs={8}> {/* Use xs/sm for responsiveness */}
                                        <Field
                                            inputRef={nameRef} // Ref for focusing
                                            as={TextField} // Use 'as' prop
                                            variant="outlined"
                                            label="Name"
                                            name="name"
                                            required // Add required indicator
                                            error={!!errors.name && !!touched.name}
                                            helperText={touched.name && errors.name ? String(errors.name) : ' '}
                                        />
                                    </Grid>
                                    <Grid xs={4} >
                                        <Field
                                            as={TextField}
                                            
                                            variant="outlined"
                                            label="Stock Count"
                                            name="stock"
                                            type="number" // Use type="number" for numeric input
                                            required
                                            error={!!errors.stock && !!touched.stock}
                                            helperText={touched.stock && errors.stock ? String(errors.stock) : ' '}
                                        />
                                    </Grid>
                                    <Grid xs={6}>
                                        <Field
                                            as={TextField}
                                            
                                            variant="outlined"
                                            label="Location" // Use consistent labels if possible
                                            name="location"
                                            error={!!errors.location && !!touched.location}
                                            helperText={touched.location && errors.location ? String(errors.location) : ' '}
                                        />
                                    </Grid>
                                    <Grid xs={6}>
                                        <Field
                                            as={TextField}
                                            
                                            variant="outlined"
                                            label="Position" // Use consistent labels
                                            name="position"
                                            error={!!errors.position && !!touched.position}
                                            helperText={touched.position && errors.position ? String(errors.position) : ' '}
                                        />
                                    </Grid>

                                    {/* Submit/Cancel Buttons */}
                                    <Grid xs={12}>
                                        <Stack
                                            direction={{ xs: 'column', sm: 'row' }} // Stack vertically on small screens
                                            spacing={2}
                                            justifyContent="space-between"
                                            alignItems="center"
                                            sx={{ mt: 4 }} // Margin top
                                            >
                                            <Button
                                                variant="contained" // Use contained for primary action
                                                color='success'
                                                disabled={isSubmitting} // Disable only while submitting
                                                type='submit'
                                                startIcon={<SaveIcon />}
                                                fullWidth // Take full width on small screens
                                                >
                                                {action === "add" ? "Add Item" : "Update Item"}
                                            </Button>
                                            <Button
                                                variant="outlined" // Use outlined for secondary action
                                                color='error'
                                                disabled={isSubmitting}
                                                onClick={handleClose}
                                                startIcon={<CloseIcon />}
                                                fullWidth // Take full width on small screens
                                                >
                                                Cancel
                                            </Button>
                                        </Stack>
                                    </Grid>
                                </Grid>
                            </Form>
                        </Container>
                    )}
                </Formik>
            </Modal>
        </div>
    );
}

export default AddEntry; // Ensure export name matches component name