import { Button, TextField } from "@mui/material";
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';

export default function NumberSpinner({ value, onChange }: { value: number, onChange: any }) {
    const increment = () => onChange(value + 0.5);
    const decrement = () => onChange(value - 0.5);
    const buttonWidth = '40px';
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "0px" }}>
            <Button variant="outlined" style={{ minWidth: buttonWidth, maxWidth: buttonWidth }} onClick={decrement}><RemoveIcon /></Button>
            <TextField
                type="number"
                value={value}
                style={{ width: "70px", textAlign: "center" }}
                inputProps={{ min: 0, style: { textAlign: 'center' } }}
                sx={{
                    "& input[type=number]": {
                        MozAppearance: "textfield", // Remove arrows in Firefox
                    },
                    "& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button": {
                        WebkitAppearance: "none", // Remove arrows in Chrome, Safari, Edge, etc.
                        margin: 0,
                    },
                    '& .MuiInputBase-root': {
                        height: '37px',
                        //padding: '2px',
                        backgroundColor: '#ffffff'
                    }
                }}
            />
            <Button variant="outlined" style={{ minWidth: buttonWidth, maxWidth: buttonWidth }} onClick={increment}><AddIcon /></Button>
        </div>
    );
}