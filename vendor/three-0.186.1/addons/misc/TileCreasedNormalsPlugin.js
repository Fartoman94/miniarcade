import{BufferAttribute as T}from"three";class U{constructor({creaseAngle:l=Math.PI/3}={}){this.creaseAngle=l,this._requestId=0,this._pending=new Map;const o=`

			${j.toString()}

			onmessage = ( { data } ) => {

				const { id, positions, creaseAngle } = data;
				const normals = computeCreasedNormals( positions, creaseAngle );
				postMessage( { id, positions, normals }, [ positions.buffer, normals.buffer ] );

			};

		`;this._worker=new Worker(URL.createObjectURL(new Blob([o]))),this._worker.onmessage=({data:n})=>{this._pending.get(n.id)(n),this._pending.delete(n.id)}}processTileModel(l){const o=[];return l.traverse(n=>{n.geometry&&o.push(this._processMesh(n))}),Promise.all(o)}_processMesh(l){const o=l.geometry.index?l.geometry.toNonIndexed():l.geometry,n=o.attributes.position.array,r=this._requestId++;return this._worker.postMessage({id:r,positions:n,creaseAngle:this.creaseAngle},[n.buffer]),new Promise(y=>{this._pending.set(r,({positions:c,normals:f})=>{o.setAttribute("position",new T(c,3)),o.setAttribute("normal",new T(f,3)),l.geometry=o,y()})})}dispose(){this._worker.terminate()}}function j(s,l){const o=Math.cos(l),n=(1+1e-10)*100,r=s.length/3,y=r/3,c=new Float64Array(y*3);for(let e=0;e<y;e++){const t=9*e,d=s[t+0],h=s[t+1],g=s[t+2],a=s[t+3],i=s[t+4],m=s[t+5],u=s[t+6],M=s[t+7],x=s[t+8],k=u-a,p=M-i,L=x-m,_=d-a,v=h-i,z=g-m,q=p*z-L*v,F=L*_-k*z,B=k*v-p*_,O=1/(Math.sqrt(q*q+F*F+B*B)||1);c[3*e+0]=q*O,c[3*e+1]=F*O,c[3*e+2]=B*O}const f=new Int32Array(r),b=new Int32Array(r*3);let I=1;for(;I<r*2;)I<<=1;const R=I-1,S=new Int32Array(I);let w=0;for(let e=0;e<r;e++){const t=3*e,d=~~(s[t+0]*n),h=~~(s[t+1]*n),g=~~(s[t+2]*n);let a=(Math.imul(d,73856093)^Math.imul(h,19349663)^Math.imul(g,83492791))&R;for(;;){const i=S[a];if(i===0){const u=3*w;b[u+0]=d,b[u+1]=h,b[u+2]=g,S[a]=w+1,f[e]=w++;break}const m=3*(i-1);if(b[m+0]===d&&b[m+1]===h&&b[m+2]===g){f[e]=i-1;break}a=a+1&R}}const A=new Int32Array(w+1);for(let e=0;e<r;e++)A[f[e]+1]++;for(let e=0;e<w;e++)A[e+1]+=A[e];const C=new Int32Array(r),P=A.slice(0,w);for(let e=0;e<y;e++){const t=3*e;C[P[f[t+0]]++]=e,C[P[f[t+1]]++]=e,C[P[f[t+2]]++]=e}const N=new Float32Array(r*3);for(let e=0;e<y;e++){const t=3*e,d=c[t+0],h=c[t+1],g=c[t+2];for(let a=0;a<3;a++){const i=t+a,m=f[i];let u=0,M=0,x=0;for(let p=A[m],L=A[m+1];p<L;p++){const _=3*C[p],v=c[_+0],z=c[_+1],q=c[_+2];d*v+h*z+g*q>o&&(u+=v,M+=z,x+=q)}const k=1/(Math.sqrt(u*u+M*M+x*x)||1);N[3*i+0]=u*k,N[3*i+1]=M*k,N[3*i+2]=x*k}}return N}export{U as TileCreasedNormalsPlugin};
