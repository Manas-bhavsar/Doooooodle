import "./style.css";
export const metadata = { title: "Doooodle", description: "Handwritten notes, made editable" };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
