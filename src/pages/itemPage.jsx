import { useParams } from 'react-router-dom';
import supabase from 'src/utils/supabaseClient';
import { useEffect, useState } from 'react';
import { Paper } from '@mui/material';

//layout
import Grid from '@mui/material/Grid2';

//styles
import { styled } from '@mui/system';

//charts
import StockHistoryChart from '../components/StockHistoryChart';

//qr code
import QRCode from "react-qr-code";

const StyledPaper = styled(Paper)(() => ({
    backgroundColor: '#242424',
    border: '1px solid #0a152f',
    borderRadius: '5px',
    color:'#F5F0F3',
    minWidth: '400px',
    minHeight: '200px',
    alignContent: 'center',
}));


const ItemPage = () => {
  const { id } = useParams();
  const [item, setItem] = useState([]);

  const fetchItems = async () => {

    const { data: foundItem, error } = await supabase
    .from('items')
    .select(`
      *,
      stock(*)
    `)
    .eq('id', id)
    .single()

    if (error) {
      console.log('error', error)
    } else {
      console.log('items', foundItem)
    
      setItem(foundItem) 
    }
  }

    useEffect(() => {
        fetchItems();
    }, []);


  return(
    <Grid container spacing={2}>
      <Grid item xs={1}>
        <StyledPaper>{item.id}</StyledPaper>
      </Grid>
      <Grid item xs={6}>
        <StyledPaper>{item.name}</StyledPaper>
      </Grid>
      <Grid item xs={5}>
      <StyledPaper>
      <div style={{ height: "auto", margin: "0 auto", maxWidth: 256, width: "100%" }}>
        <QRCode
            size={256}
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            value={window.location.href}
            viewBox={`0 0 256 256`}
        />
      </div>
      </StyledPaper>
      </Grid>
      <Grid item xs={12}>
      <StockHistoryChart stockData={item.stock}/>
      </Grid>

      <Grid item xs={12}>
        <pre>{JSON.stringify(item.stock, null, 2)}</pre>
    </Grid>
    </Grid>
    )
    

}

export default ItemPage;
