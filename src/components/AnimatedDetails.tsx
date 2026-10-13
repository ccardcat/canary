import {Children,useEffect,useState,type ReactNode,type DetailsHTMLAttributes} from "react";
export function AnimatedDetails({children,open:initialOpen=false,onClick,...props}:DetailsHTMLAttributes<HTMLDetailsElement> & {children:ReactNode}){
 const [expanded,setExpanded]=useState(initialOpen);const [visible,setVisible]=useState(initialOpen);const nodes=Children.toArray(children);
 useEffect(()=>{setExpanded(initialOpen);if(initialOpen)setVisible(true);},[initialOpen]);
 useEffect(()=>{if(expanded){setVisible(true);return;}const timer=setTimeout(()=>setVisible(false),220);return()=>clearTimeout(timer);},[expanded]);
 return <details {...props} open={visible} data-expanded={expanded} onToggle={event=>{if(event.currentTarget.open&&!visible){setVisible(true);setExpanded(true);}else if(!event.currentTarget.open&&visible){setVisible(false);setExpanded(false);}props.onToggle?.(event);}} onClick={event=>{onClick?.(event);const summary=(event.target as Element).closest('summary');if(!summary||summary.parentElement!==event.currentTarget||(event.target as Element).closest('a,button,input'))return;event.preventDefault();if(!expanded&&!visible){setVisible(true);requestAnimationFrame(()=>setExpanded(true));}else setExpanded(!expanded);}}>{nodes[0]}<div className="animated-disclosure-content"><div>{nodes.slice(1)}</div></div></details>;
}
