export const bus=new EventTarget();
export const emit=(name,detail)=>bus.dispatchEvent(new CustomEvent(name,{detail}));
export const toast=text=>emit('toast',{text,kind:'info'});
