import type { IPalette, ITypography } from './types';

declare module '@mui/material/styles' {
    interface Palette extends IPalette {}
    interface PaletteOptions extends Partial<IPalette> {}
    interface TypographyVariants extends ITypography {}
    interface TypographyVariantsOptions extends Partial<ITypography> {}
}
