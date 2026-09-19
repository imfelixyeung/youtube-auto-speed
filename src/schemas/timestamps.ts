import { z } from "zod";

export const timestampSchema = z.coerce.number();
