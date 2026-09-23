import PageHeader from "../../components/common/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { Settings, Bell, Shield } from "lucide-react";

const FinanceSettings = () => {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader title="Settings" subtitle="Profile, notifications, and security" icon="Settings" breadcrumb={["Finance", "Settings"]} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-base p-5">
          <h3 className="font-bold text-app mb-3 flex items-center gap-2"><Settings size={16} /> Profile</h3>
          <div className="space-y-3 text-sm">
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Name</label><input className="input-base py-2 text-sm w-full" defaultValue={user?.name} /></div>
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Email</label><input className="input-base py-2 text-sm w-full" defaultValue={user?.email} /></div>
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Role</label><input className="input-base py-2 text-sm w-full" defaultValue="Finance Coordinator" disabled /></div>
            <button className="btn-primary text-sm w-full">Save Changes</button>
          </div>
        </div>
        <div className="card-base p-5">
          <h3 className="font-bold text-app mb-3 flex items-center gap-2"><Bell size={16} /> Notifications</h3>
          <div className="space-y-2 text-sm">
            {["Email on new payments", "SMS on overdue accounts", "Daily collection digest", "Approval queue alerts"].map((t, i) => (
              <label key={i} className="flex items-center gap-2 text-app"><input type="checkbox" defaultChecked={i < 3} /> {t}</label>
            ))}
          </div>
        </div>
        <div className="card-base p-5">
          <h3 className="font-bold text-app mb-3 flex items-center gap-2"><Shield size={16} /> Security</h3>
          <div className="space-y-3 text-sm">
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Current Password</label><input type="password" className="input-base py-2 text-sm w-full" /></div>
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">New Password</label><input type="password" className="input-base py-2 text-sm w-full" /></div>
            <button className="btn-primary text-sm w-full">Update Password</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceSettings;
