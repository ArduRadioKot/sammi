import { useParams } from "react-router-dom";
import { TableEditor } from "@/features/tables/components/table-editor";

export default function TablePage() {
  const { id } = useParams();
  return <TableEditor tableId={id ?? ""} />;
}
