//! Ask only this client's X11 window to close. XCB checked requests avoid the
//! process-wide Xlib error handler, including races with disappearing windows.
use std::ffi::{c_char,c_int,c_void};
#[repr(C)]#[derive(Clone,Copy)]struct Cookie{sequence:u32}
#[repr(C)]struct Screen{root:u32}
#[repr(C)]struct Screens{data:*mut Screen,remaining:c_int,index:c_int}
#[repr(C)]struct AtomReply{response:u8,pad:u8,sequence:u16,length:u32,atom:u32}
#[repr(C)]struct Property{response:u8,format:u8,sequence:u16,length:u32,kind:u32,remaining:u32,count:u32,pad:[u8;12]}
#[repr(C)]struct Message{response:u8,format:u8,sequence:u16,window:u32,kind:u32,data:[u32;5]}
#[link(name="xcb")]
unsafe extern "C" {
    fn xcb_connect(display:*const c_char,screen:*mut c_int)->*mut c_void;
    fn xcb_disconnect(connection:*mut c_void);
    fn xcb_connection_has_error(connection:*mut c_void)->c_int;
    fn xcb_get_setup(connection:*mut c_void)->*const c_void;
    fn xcb_setup_roots_iterator(setup:*const c_void)->Screens;
    fn xcb_screen_next(screens:*mut Screens);
    fn xcb_intern_atom(connection:*mut c_void,only_existing:u8,len:u16,name:*const c_char)->Cookie;
    fn xcb_intern_atom_reply(connection:*mut c_void,cookie:Cookie,error:*mut *mut c_void)->*mut AtomReply;
    fn xcb_query_tree(connection:*mut c_void,window:u32)->Cookie;
    fn xcb_query_tree_reply(connection:*mut c_void,cookie:Cookie,error:*mut *mut c_void)->*mut c_void;
    fn xcb_query_tree_children_length(reply:*const c_void)->c_int;
    fn xcb_query_tree_children(reply:*const c_void)->*const u32;
    fn xcb_get_property(connection:*mut c_void,delete:u8,window:u32,property:u32,kind:u32,offset:u32,len:u32)->Cookie;
    fn xcb_get_property_reply(connection:*mut c_void,cookie:Cookie,error:*mut *mut c_void)->*mut Property;
    fn xcb_get_property_value(reply:*const Property)->*const c_void;
    fn xcb_get_property_value_length(reply:*const Property)->c_int;
    fn xcb_send_event_checked(connection:*mut c_void,propagate:u8,window:u32,mask:u32,event:*const c_char)->Cookie;
    fn xcb_request_check(connection:*mut c_void,cookie:Cookie)->*mut c_void;
    fn xcb_flush(connection:*mut c_void)->c_int;
    fn free(pointer:*mut c_void);
}
struct Connection(*mut c_void);impl Drop for Connection{fn drop(&mut self){if !self.0.is_null(){unsafe{xcb_disconnect(self.0);}}}}
unsafe fn atom(c:*mut c_void,name:&[u8])->Option<u32>{
    let reply=unsafe{xcb_intern_atom_reply(c,xcb_intern_atom(c,1,name.len() as u16,name.as_ptr().cast()),std::ptr::null_mut())};
    if reply.is_null(){return None;}let id=unsafe{(*reply).atom};unsafe{free(reply.cast());}if id==0{None}else{Some(id)}
}
unsafe fn property(c:*mut c_void,window:u32,atom:u32,kind:u32)->Vec<u32>{
    let reply=unsafe{xcb_get_property_reply(c,xcb_get_property(c,0,window,atom,kind,0,1024),std::ptr::null_mut())};
    if reply.is_null(){return vec![];}
    let count=unsafe{xcb_get_property_value_length(reply)};let data=unsafe{xcb_get_property_value(reply)};
    let values=if unsafe{(*reply).format}==32&&count>0&&count<=4096&&!data.is_null(){unsafe{std::slice::from_raw_parts(data.cast::<u32>(),count as usize/4)}.to_vec()}else{vec![]};
    unsafe{free(reply.cast());}values
}
pub fn close(pid:u32)->bool {
    unsafe {
        let mut screen=0;let connection=Connection(xcb_connect(std::ptr::null(),&mut screen));let c=connection.0;
        if c.is_null()||xcb_connection_has_error(c)!=0{return false;}
        let Some(pid_atom)=atom(c,b"_NET_WM_PID") else{return false;};
        let Some(protocols)=atom(c,b"WM_PROTOCOLS") else{return false;};
        let Some(delete)=atom(c,b"WM_DELETE_WINDOW") else{return false;};
        let mut screens=xcb_setup_roots_iterator(xcb_get_setup(c));for _ in 0..screen{xcb_screen_next(&mut screens);}
        if screens.remaining<=0||screens.data.is_null(){return false;}
        let mut queue=vec![((*screens.data).root,0)];let mut visited=0;let mut sent=false;
        while let Some((window,depth))=queue.pop(){visited+=1;if visited>8192{break;}
            if property(c,window,pid_atom,6)==[pid]&&property(c,window,protocols,4).contains(&delete){
                let message=Message{response:33,format:32,sequence:0,window,kind:protocols,data:[delete,0,0,0,0]};
                let error=xcb_request_check(c,xcb_send_event_checked(c,0,window,0,(&message as *const Message).cast()));
                if error.is_null(){sent=true;}else{free(error);}continue;
            }
            if depth>=4{continue;}
            let reply=xcb_query_tree_reply(c,xcb_query_tree(c,window),std::ptr::null_mut());if reply.is_null(){continue;}
            let count=xcb_query_tree_children_length(reply);let children=xcb_query_tree_children(reply);
            if count>0&&count<=8192&&!children.is_null(){queue.extend(std::slice::from_raw_parts(children,count as usize).iter().map(|child|(*child,depth+1)));}
            free(reply);
        }
        xcb_flush(c);sent
    }
}
