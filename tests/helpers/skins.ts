// Original disposable 64x64 texture with transparent overlay layers.
export function skinFixture(){
 const canvas=document.createElement("canvas");canvas.width=canvas.height=64;
 const c=canvas.getContext("2d")!;
 c.fillStyle="#be875c";c.fillRect(0,0,32,16);c.fillRect(40,16,16,16);c.fillRect(32,48,16,16);
 c.fillStyle="#443027";c.fillRect(0,0,32,8);c.fillRect(8,8,8,2);
 c.fillStyle="#ede4d1";c.fillRect(9,11,2,1);c.fillRect(13,11,2,1);
 c.fillStyle="#305b74";c.fillRect(10,11,1,1);c.fillRect(13,11,1,1);
 c.fillStyle="#774935";c.fillRect(11,13,2,1);
 c.fillStyle="#428c6c";c.fillRect(16,16,24,16);c.fillRect(40,20,16,4);c.fillRect(32,52,16,4);
 c.fillStyle="#344b6c";c.fillRect(0,16,16,16);c.fillRect(16,48,16,16);
 return canvas.toDataURL();
}
