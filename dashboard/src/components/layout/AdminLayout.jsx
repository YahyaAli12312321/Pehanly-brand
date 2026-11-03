import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ToastContainer } from "../common/ToastContainer";
import { InventoryAlertsDrawer } from "./InventoryAlertsDrawer";
import { B2BPipelineDrawer } from "./B2BPipelineDrawer";
import { AttentionQueueDrawer } from "./AttentionQueueDrawer";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { QuickQuoteModal } from "./QuickQuoteModal";
export const AdminLayout = () => {
  return <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] flex font-sans">
      {
    /* Sidebar Navigation */
  }
      <Sidebar />

      {
    /* Main Viewport */
  }
      <div className="lg:pl-64 flex-1 flex flex-col min-h-screen min-w-0">
        <Header />

        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8 max-w-[1720px] mx-auto">
          <Outlet />
        </main>
      </div>

      {
    /* Global Interactive Drawers and Overlays */
  }
      <InventoryAlertsDrawer />
      <B2BPipelineDrawer />
      <AttentionQueueDrawer />
      <NotificationsDrawer />
      <CommandPaletteModal />
      <QuickQuoteModal />
      <ToastContainer />
    </div>;
};
