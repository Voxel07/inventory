import React, { useEffect, useState, useRef } from 'react'

//Form
import { Formik, Field, Form } from 'formik';
import * as yup from 'yup';

//MUI
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid2';
import Backdrop from '@mui/material/Backdrop';
import Modal from '@mui/material/Modal';
import Button from '@mui/material/Button';
import { Container, Typography } from '@mui/material';
import InputAdornment from '@mui/material/InputAdornment';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import Stack from "@mui/material/Stack";
import Autocomplete from '@mui/material/Autocomplete';
import CloseIcon from '@mui/icons-material/Close';
import { IconButton } from '@mui/material/';
import ClearIcon from '@mui/icons-material/Clear';
import { createTheme, ThemeProvider } from '@mui/material';

import supabase from '../utils/supabaseClient';

//Feedback
import { AlertsManager } from '../utils/AlertsManager';

const style = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -100%)',
    backgroundColor: '#090c11',
    bosizehadow: "24 red",
    border: '5px solid #090c11',
    p: 4,
    borderRadius: '20px',
  };

  const theme = createTheme({
    components: {
      MuiAutocomplete: {
        styleOverrides: {
          root: {
            '& .MuiInputLabel-root': { color: '#DDDDDD' },
            '& .MuiOutlinedInput-root': { 
              color: '#DDDDDD',
              '& > fieldset': { borderColor: '#f5f0f3' },
            },
          },
          inputRoot: {
            color: '#f5f0f3'
          },
          clearIndicator: {
            color: 'red'
          },
          popupIndicator: {
            color: '#f5f0f3'
          },
          paper: {
            color: '#f5f0f3',
            backgroundColor: '#090c11',
          },
          option: {
            borderBottom: '1px solid #0d5459',
            '&[aria-selected="true"]': {
            backgroundColor: '#090c11', // Change this to your desired color
            color: '#1e7d29', // Change this to your desired text color
          },
          },
        },
      },
    },
  });

const AddProduct = (({action}) =>
{
    const alertsManagerRef =  useRef();
    const [open, setOpen] = useState(false);
    const nameRef = useRef();
 
    const handleOpen = () => {
        setOpen(true);
        };
    
    const handleClose = () => {
        setOpen(false);
        };
    
    const addEntry = async (values) => {
      const newItem = {
        name: values.name,
        location: values.location,
        position: values.position
      }

      const {data, error} = await supabase
      .from('items')
      .insert([newItem])
      .select();

      if (error) {
          console.log('error', error)
          alertsManagerRef.current.showAlert('error', 'Error adding item', error.message)
          return;
      } else {
          console.log('item added', data)
          alertsManagerRef.current.showAlert('success', 'Item added successfully')
      }

      const newStock = {
          item_id: data[0].id,
          stock: values.stock,
      }
      console.log(newStock)

      const {data: stockData, error: stockError} = await supabase
      .from('stock')
      .insert([newStock])
      .select();

      if (stockError) {
          console.log('error', stockError)
          alertsManagerRef.current.showAlert('error', 'Error adding stock', stockError.message)
      }
      else {
          console.log('stock added', stockData)
          alertsManagerRef.current.showAlert('success', 'Stock added successfully')
      }
    }

    const updateEntry = async (values) => {

      const updatedItem = {
        name: values.name,
        location: values.location,
        position: values.position
      }

      const { data, error } = await supabase
      .from('items')
      .update([updatedItem])
      .eq('id', values.id)
      .select()
    }


    const handleSubmit = async (values) => {
        console.log(values);

        if (action == "add") {
          addEntry(values);
        }
        else if (action == "edit") {
          updateEntry(values);
        }
        

        
    }

    const validationSchema = yup.object().shape({
      name: yup.string().required("Pflichtfeld").min(4, "min. 4 Zeichen").max(20, "max. 20 Zeichen"),
      stock: yup.number()
      .required("Pflichtfeld")
      .integer("Ganze Zahlen")
      .typeError("Numerischer Wert")
        .min(1, "min. 1"),
    })

    const FormikWithRef = React.forwardRef((props, ref) => (
        <Formik {...props} />
      ));

    return(
        <div>
        <AlertsManager ref={alertsManagerRef} />
        {
            action == "add" ?
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleOpen}>Neues Produkt hinzufügen</Button >
            :
            <IconButton variant="contained" color="warning" onClick={handleOpen}><EditIcon/></IconButton>
        }
        <Modal
        aria-labelledby="transition-modal-title"
        aria-describedby="transition-modal-description"
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border:"solid 2px" }}
        open={open}
        closeAfterTransition
        slots={{ backdrop: Backdrop }}
        slotProps={{
          backdrop: {
            timeout: 500,
          },
        }}
      >
        <FormikWithRef
        validateOnChange={true}
        initialValues={{
                name: '',
                stock: '',
                position: '',
                location: ''
                }   }
        validationSchema={validationSchema}
        onSubmit={async(data, { setSubmitting, resetForm }) => {
                setSubmitting(true);
                handleSubmit(data);
                setSubmitting(false);
            }
        }
        //end Formik
        >  
        {
            ({ values, errors, isSubmitting, touched, setFieldValue }) => {
                
                useEffect(() => {
                    if (!isSubmitting) {
                        nameRef.current.focus();
                    }
                }, [isSubmitting])

                return(
                <Container className="Form-Container" sx={{...style, width:'500px'}} >
                    {
                        action == "add" ?
                        <Typography  sx={{ marginBottom: '35px' }}>Neues Produkt hinzufügen</Typography>
                        :
                        <Typography  sx={{ marginBottom: '35px' }}>Produkt aktualisieren</Typography>
                    }

                <Form className="Form-Container" >
                <Grid container spacing={2}>
                  <Grid size={6}>
                    <Field
                      autoComplete="off"
                      inputRef={nameRef}
                      variant="outlined"
                      label="Bezeichung"
                      name="name"
                      type="input"
                      error={!!errors.name && !!touched.name}
                      helperText={!!touched.name && !!errors.name ? String(errors.description) : ' '}
                      as={TextField}
                    />
                  </Grid>
                  <Grid size={6}>
                    <Field
                      autoComplete="off"
                      variant="outlined"
                      label="Stückzahl" 
                      name="stock"
                      type="input"
                      error={!!errors.stock && !!touched.stock}
                      helperText={!!touched.stock && !!errors.stock ? String(errors.stock) : ' '}
                      as={TextField}
                    />
                  </Grid>
                  <Grid size={6}>
                    <Field
                      autoComplete="off"
                      variant="outlined"
                      label="Lageort"
                      name="position"
                      type="tel"
                      error={!!errors.position && !!touched.position}
                      helperText={!!touched.position && !!errors.position ? String(errors.position) : ' '}
                      as={TextField}
                    />
                  </Grid>
                  <Grid size={6}>
                    <Field
                      autoComplete="off"
                      variant="outlined"
                      label="Standort"
                      name="location"
                      type="tel"
                      error={!!errors.location && !!touched.location}
                      helperText={!!touched.location && !!errors.location ? String(errors.location) : ' '}
                      as={TextField}
                    />
                  </Grid>
                  <Grid size={12}>
                        </Grid>
                          {action == "add" ? null:
                          <Grid  item size={6} sx={{marginTop:'20px'}}>
                        </Grid>
                        }
                        <Grid item size={12}>
                        <Stack
                            direction="row"
                            spacing={2}
                            justifyContent="space-between"
                            alignItems="center"
                            sx={{ marginTop:'35px' }}>
                          {action == "add" ? 
                          <Button variant="outlined" color='success' disabled={isSubmitting || !errors } type='submit' startIcon={<SaveIcon />}> Hinzufügen </Button>: 
                          <Button variant="outlined" color='success' disabled={isSubmitting || !errors } type='submit' startIcon={<SaveIcon />}> Aktualisieren </Button>}
                        <Button variant="outlined" color='error' disabled={isSubmitting || !errors } onClick={handleClose}  startIcon={<CloseIcon />}> Abbrechen </Button>

                        </Stack>

                        </Grid>

                    </Grid>
                </Form>
                </Container>
                );

            }
        }
    </FormikWithRef>
    </Modal>
    </div>
    );
})

export default AddProduct