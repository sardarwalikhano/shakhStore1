import { SiteHeader } from "@/components/site-header";
import { CartContent } from "@/components/cart-content";

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <main className="container section cart-page">
        <div className="section-heading"><div><h1>سەبەتەی کڕین</h1><p>بەرهەمە هەڵبژێردراوەکانت پشکنە و بڕەکانی ڕێکبخە.</p></div></div>
        <CartContent />
      </main>
    </>
  );
}