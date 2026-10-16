import {SourceLibrary} from "../../../../_components/profiles/source-library";

export default async function SourcesPage({params}:{params:Promise<{customerId:string}>}){
  const {customerId}=await params;
  return <SourceLibrary customerId={customerId}/>;
}
