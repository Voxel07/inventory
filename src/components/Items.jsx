import { useEffect, useState, useRef } from 'react';
import { TableCell, Table, TableBody, TableContainer, TableHead, TableRow } from '@mui/material';
import { IconButton,  Paper } from '@mui/material/';
import DeleteIcon from '@mui/icons-material/Delete';
import LaunchIcon from '@mui/icons-material/Launch';
import AddEntry from './AddEntry'
import { styled } from '@mui/system';
import Stack from "@mui/material/Stack";
import { useNavigate } from 'react-router-dom';
// search

import  supabase from "src/utils/supabaseClient";

//Feedback
import { AlertsManager , AlertsContext } from 'src/utils/AlertsManager';

const StyledPaper = styled(Paper)(() => ({
    backgroundColor: '#090c11', // Semi-transparent white
    borderRadius: '5px',
    color:'#F5F0F3',
    minWidth: '1200px',
}));

const Items = () => {

    const alertsManagerRef =  useRef(AlertsContext);
    const [items, setItems] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        // Create the channel for listening to changes
        const channel = supabase
          .channel('items-changes')
          .on(
            'postgres_changes',
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'items' 
            },
            async (payload) => {
              const { data: stockData } = await supabase
                .from('stock')
                .select('*')
                .eq('item_id', payload.new.id)
                .order('created_at', { ascending: false })
                .limit(1);
      
              const latestStock = stockData && stockData.length > 0 ? stockData[0] : null;
      
              setItems(prevItems => {
                const newItemWithStock = {
                  ...payload.new,
                  stock: stockData || [],
                  latestStock: latestStock
                };
                
                return [...prevItems, newItemWithStock];
              });
            }
          )
          .on(
            'postgres_changes',
            { 
              event: 'UPDATE', 
              schema: 'public', 
              table: 'items' 
            },
            async (payload) => {
              const { data: stockData } = await supabase
                .from('stock')
                .select('*')
                .eq('item_id', payload.new.id)
                .order('created_at', { ascending: false })
                .limit(1);
      
              const latestStock = stockData && stockData.length > 0 ? stockData[0] : null;
      
              setItems(prevItems => 
                prevItems.map(item => 
                  item.id === payload.new.id 
                    ? { ...payload.new, stock: stockData || [], latestStock: latestStock }
                    : item
                )
              );
            }
          )
          .on(
            'postgres_changes',
            { 
              event: 'DELETE', 
              schema: 'public', 
              table: 'items' 
            },
            (payload) => {
              setItems(prevItems => 
                prevItems.filter(item => item.id !== payload.old.id)
              );
            }
          )
          .subscribe();
      
        // Cleanup subscription on component unmount
        return () => {
          supabase.removeChannel(channel);
        };
      }, []);
    

    const fetchItems = async () => {

        const { data: items, error } = await supabase
            .from('items')
            .select(`
                *,
                stock (
                    stock,
                    created_at
                )
                // Assumes stock table/view with latest stock per item
            `)
    
        if (error) {
            console.log('error', error)
            alertsManagerRef.current.showAlert('error', 'Error fetching items', error.message)
        } else {
            console.log('items', items)
            alertsManagerRef.current.showAlert('success', 'Items fetched successfully')
            const itemsWithLatestStock = items.map(item => ({
                ...item,
                latestStock: item.stock.length > 0 
                    ? item.stock.reduce((latest, current) => 
                        new Date(current.created_at) > new Date(latest.created_at) ? current : latest)
                    : null
            }))
            setItems(itemsWithLatestStock) 
        }
    }

    useEffect(() => {
        fetchItems();
    }, []);


    const handleDelete = async (id) => {
        
        try {
            // Delete stock entry first
            const { error: stockError } = await supabase
                .from('stock')
                .delete()
                .eq('item_id', id);
    
            if (stockError) throw stockError;
    
            // Then delete the main item
            const { error: itemError } = await supabase
                .from('items')
                .delete()
                .eq('id', id);
    
            if (itemError) throw itemError;
    
            setItems(prevItems => prevItems.filter(item => item.id !== id));
            alertsManagerRef.current.showAlert('success', 'Item deleted successfully');
    
        } catch (error) {
            console.error('Delete error:', error);
            alertsManagerRef.current.showAlert('error', 'Error deleting item', error.message);
        }
    }

    const handleRedirect = (id) => {
        const baseUrl = import.meta.env.BASE_URL || '/'; //  Important: Use import.meta.env.BASE_URL
        const targetUrl = `${baseUrl}item/${id}`;
    
        navigate(targetUrl);
    }
    
    return (
            <TableContainer component={StyledPaper}>
            <AlertsManager ref={alertsManagerRef} />
                <Table >
                    <TableHead>
                        <TableRow >
                            <TableCell>ID</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Stückzahl</TableCell>
                            <TableCell>Lagerort</TableCell>
                            <TableCell>Lagerposition</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                       {items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell >
                                       {item.id}
                                </TableCell>
                                <TableCell >
                                       {item.name}
                                </TableCell>
                                <TableCell>
                                       {JSON.stringify(item?.stock[0]?.stock)}
                                </TableCell>
                                <TableCell>
                                        {item.location}
                                </TableCell>
                                <TableCell>
                                        {item.position}
                                </TableCell>
                                <TableCell>
                                    <Stack  direction="row"
                                            spacing={0}
                                            alignItems="start">
                                        <IconButton variant="contained" color="info" onClick={( )=> handleRedirect(item.id)}><LaunchIcon/></IconButton>
                                        <AddEntry action={"update"} ItemToModify={item}/>
                                        <IconButton variant="contained" onClick={() => handleDelete(item.id)} color="error"><DeleteIcon/></IconButton>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>

                </Table>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', marginBottom: '20px' }}>
                    <AddEntry action={"add"} />
                </div>
                {/* <pre>{JSON.stringify(items, null, 2)}</pre> */}
                </TableContainer>
    );
};

export default Items;