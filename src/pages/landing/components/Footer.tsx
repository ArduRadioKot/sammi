import { Link } from "react-router-dom";
import { APP_NAME } from "@/lib/constants/config";
import { LogoMark } from "@/components/shell/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      ["Платформа", "/product"],
      ["Table Editor", "/product"],
      ["Waterfall", "/product"],
    ],
  },
  {
    title: "Solutions",
    links: [
      ["Outbound", "/solutions"],
      ["Signal Selling", "/solutions"],
      ["Research", "/solutions"],
    ],
  },
  {
    title: "Platform",
    links: [
      ["Workspace", "/product"],
      ["Waterfall", "/product"],
      ["Signals", "/product"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Docs", "/docs"],
      ["Security", "/security"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Company",
    links: [
      ["О продукте", "/product"],
      ["Контакты", "/docs"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Конфиденциальность", "/security"],
      ["152-ФЗ", "/security"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative z-[2] border-t border-line px-5 pt-16 pb-8 lg:px-10">
      <div className="mx-auto grid max-w-[1240px] gap-10 md:grid-cols-3 lg:grid-cols-6">
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <div className="text-[11px] tracking-[0.14em] text-ink-faint uppercase">{column.title}</div>
            <ul className="mt-3 space-y-2 text-[13px] text-ink-muted">
              {column.links.map(([label, href]) => (
                <li key={label}>
                  <Link to={href} className="hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-16 flex max-w-[1240px] items-end justify-between gap-4">
        <div className="flex items-center gap-2 text-[13px] text-ink-faint">
          <LogoMark className="h-4 w-4" />
          {APP_NAME}
        </div>
        <div className="text-[12vw] leading-none font-medium tracking-[-0.07em] text-[rgba(231,238,234,0.06)] select-none">
          {APP_NAME}
        </div>
      </div>
    </footer>
  );
}
