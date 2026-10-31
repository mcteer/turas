import {z} from 'zod';

/** Present a flat object to providers while validating the original call shape.
 * Keep raw values untouched until the final validator: parsing the presentation
 * first can strip unknown nested keys before a union checks them. */
export function objectToolInput<T extends z.ZodType<unknown,Record<string,unknown>>>(presentation:z.ZodObject,validator:T){
 const {$schema,...input}=z.toJSONSchema(presentation,{io:'input'});
 return z.looseObject({}).meta(input).pipe(validator);
}
