import React from 'react';
import { Button, IconButton } from './ActionButtons';

export interface TooltipButtonProps {
    tooltipText: string;
    icon?: React.ReactNode;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    label?: string; // If provided, renders a Button; otherwise renders an IconButton
    variant?: 'text' | 'outlined' | 'contained' | 'icon';
    color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
    size?: 'small' | 'medium' | 'large';
    disabled?: boolean;
    fullWidth?: boolean;
    type?: 'button' | 'submit' | 'reset';
}

export function TooltipButton({
    tooltipText,
    icon,
    onClick,
    label,
    variant = 'contained',
    color = 'primary',
    size = 'medium',
    disabled = false,
    fullWidth = false,
    type = 'button',
}: TooltipButtonProps) {
    if (!label || variant === 'icon') {
        return (
            <IconButton
                title={tooltipText}
                color={color}
                size={size}
                onClick={onClick}
                disabled={disabled}
                type={type}
            >
                {icon}
            </IconButton>
        );
    }

    return (
        <Button
            title={tooltipText}
            variant={variant}
            color={color}
            size={size}
            onClick={onClick}
            disabled={disabled}
            startIcon={icon}
            fullWidth={fullWidth}
            type={type}
        >
            {label}
        </Button>
    );
}
