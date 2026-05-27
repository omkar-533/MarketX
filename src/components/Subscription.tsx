import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Check, Zap, Shield, Star, CreditCard } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '../data/marketData';
import type { User } from '../hooks/useAuth';

interface SubscriptionProps { user: User | null; }

export default function Subscription({ user }: SubscriptionProps) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro' | 'premium'>(user?.plan || 'free');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[#d4af37] flex items-center justify-center gap-2"><Crown className="w-5 h-5" />Subscription Plans</h2>
        <p className="text-sm text-slate-600 mt-1">Choose the plan that fits your trading needs</p>
      </div>

      <div className="flex justify-center">
        <div className="flex bg-[#121520] rounded-lg border border-[#1a1f2e] overflow-hidden">
          <button onClick={() => setBilling('monthly')} className={`px-6 py-2 text-sm font-medium transition-all ${billing === 'monthly' ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'text-slate-500 hover:text-slate-300'}`}>Monthly</button>
          <button onClick={() => setBilling('yearly')} className={`px-6 py-2 text-sm font-medium transition-all ${billing === 'yearly' ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'text-slate-500 hover:text-slate-300'}`}>Yearly <span className="text-[10px] text-emerald-400">Save 20%</span></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {SUBSCRIPTION_PLANS.map((plan, idx) => {
          const isCurrent = selectedPlan === plan.id;
          const price = billing === 'yearly' ? Math.round(plan.price * 12 * 0.8) : plan.price;
          const period = billing === 'yearly' ? 'year' : 'month';
          return (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
              className={`relative bg-[#0b0e17] border rounded-xl p-6 transition-all ${plan.popular ? 'border-[#d4af37]/40 shadow-lg shadow-[#d4af37]/5' : 'border-[#1a1f2e]'} ${isCurrent ? 'ring-1 ring-[#d4af37]/30' : ''}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#d4af37] text-[#0b0e17] text-[10px] font-bold rounded-full flex items-center gap-1">
                  <Star className="w-3 h-3" />Most Popular
                </div>
              )}
              <div className="text-center mb-4">
                <div className="text-sm font-bold text-slate-400 uppercase tracking-wider">{plan.name}</div>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-[#d4af37]">{plan.price === 0 ? 'Free' : `₹${price}`}</span>
                  {plan.price > 0 && <span className="text-sm text-slate-600">/{period}</span>}
                </div>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <Check className={`w-3.5 h-3.5 ${plan.popular ? 'text-[#d4af37]' : 'text-emerald-400'}`} />{f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setSelectedPlan(plan.id as 'free' | 'pro' | 'premium')}
                className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  isCurrent ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : plan.popular ? 'bg-[#d4af37] text-[#0b0e17] hover:bg-[#b8941f]' : 'bg-[#121520] text-slate-300 border border-[#1a1f2e] hover:border-[#d4af37]/30'
                }`}>
                {isCurrent ? <><Shield className="w-4 h-4" />Current Plan</> : plan.price === 0 ? 'Get Started' : <><CreditCard className="w-4 h-4" />Subscribe</>}
              </button>
            </motion.div>
          );
        })}
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 max-w-4xl mx-auto">
        <h3 className="text-sm font-bold text-[#d4af37] mb-3 flex items-center gap-2"><Zap className="w-4 h-4" />Payment Methods</h3>
        <div className="grid grid-cols-3 gap-3">
          {['UPI', 'Razorpay', 'Stripe'].map(method => (
            <button key={method} className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e] hover:border-[#d4af37]/30 transition-colors text-center">
              <div className="text-sm font-bold text-slate-300">{method}</div>
              <div className="text-[10px] text-slate-600">Secure Payment</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
