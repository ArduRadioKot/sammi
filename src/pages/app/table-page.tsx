import { useParams, useSearchParams } from "react-router-dom";
import { RowSource } from "@/features/relationship/row-source";
import { TableEditor } from "@/features/tables/components/table-editor";

export default function TablePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const row = params.get("row");
  return (
    <>
      <TableEditor tableId={id ?? ""} />
      {id && row && (
        <RowSource key={`${id}:${row}`} tableId={id} rowId={row} onClose={() => {
          const next = new URLSearchParams(params);
          next.delete("row");
          setParams(next, { replace: true });
        }} />
      )}
    </>
  );
}
