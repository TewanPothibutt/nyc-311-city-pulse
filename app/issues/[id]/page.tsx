import Portal from '../../portal';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Portal view="detail" id={id}/>}
