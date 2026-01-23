# BizGrow AI - Wireframes & UI Design

## 🎨 Design System Overview

### Color Palette
```
Primary Colors:
- Indigo: #4f46e5 (Primary actions, branding)
- Slate: #1e293b (Text, backgrounds)
- White: #ffffff (Cards, surfaces)

Status Colors:
- Green: #10b981 (Success, active states)
- Yellow: #f59e0b (Warning, pending states)
- Red: #ef4444 (Error, inactive states)
- Blue: #3b82f6 (Information, discovery)
- Purple: #8b5cf6 (Proposals, AI actions)
```

### Typography
```
Font Family: Inter (Google Fonts)
- Headings: 700 (Bold)
- Subheadings: 600 (Semibold)
- Body: 400 (Regular)
- Captions: 500 (Medium)
```

## 📱 Main Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ BizGrow AI                                                    [🔔] [⚙️] [👤] │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   📊 Metrics    │    │   🎯 Targets    │    │   💰 Revenue    │            │
│  │                 │    │                 │    │                 │            │
│  │  Total Leads    │    │  Interested     │    │  Projects       │            │
│  │     1,247       │    │      23         │    │      12         │            │
│  │   (+12% ↗️)     │    │   (+8% ↗️)      │    │  (+15% ↗️)      │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                          Recent Leads                                      │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  📍 Tony's Pizzeria          📞 (555) 123-4567    🌐 No Website   [Pitch] │
│  │     123 Main St, NYC         ⭐ 4.2 (89 reviews)   Status: NEW            │
│  │                                                                             │
│  │  📍 Green Leaf Cafe          📞 (555) 987-6543    🌐 Has Website  [Pitch] │
│  │     456 Oak Ave, LA          ⭐ 4.7 (156 reviews)  Status: CONTACTED       │
│  │                                                                             │
│  │  📍 Metro Auto Repair        📞 (555) 456-7890    🌐 No Website   [Pitch] │
│  │     789 Pine St, Chicago     ⭐ 4.0 (67 reviews)   Status: INTERESTED      │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  [🔍 Find More Leads]  [📊 View Analytics]  [⚙️ Agent Settings]               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🤖 Developer Control Center Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Developer Control Center                          [🟢 Connected] [▶️ Auto ON]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   🏢 Discovered │    │   📧 Proposals  │    │   💡 Interested │            │
│  │      1,247      │    │       89        │    │       23        │            │
│  │    (+12% ↗️)    │    │    (+8% ↗️)     │    │   (+23% ↗️)     │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                          🤖 AI Agents Status                               │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  🔍 Business Discovery Agent        [🟢 ACTIVE]     Performance: 94%  [⚙️] │
│  │     "Scanning restaurants in Austin, TX"           Tasks: 247              │
│  │     ████████████████████████████████████████████████████████████████ 94%   │
│  │                                                                             │
│  │  📝 Proposal Generation Agent       [🟢 ACTIVE]     Performance: 87%  [⚙️] │
│  │     "Creating pitch for Mario's Pizza"             Tasks: 89               │
│  │     ████████████████████████████████████████████████████████████ 87%       │
│  │                                                                             │
│  │  🔨 Project Builder Agent           [🟡 IDLE]       Performance: 96%  [⚙️] │
│  │     "Waiting for interested businesses"            Tasks: 23               │
│  │     ████████████████████████████████████████████████████████████████████ 96%│
│  │                                                                             │
│  │  📊 Market Analytics Agent          [🟢 ACTIVE]     Performance: 91%  [⚙️] │
│  │     "Analyzing NYC restaurant trends"              Tasks: 156              │
│  │     ████████████████████████████████████████████████████████████████ 91%   │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                        📍 Regional Performance                             │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  🏙️ New York        1,247 businesses    18% conversion    $45,200 revenue  │
│  │  🌴 Los Angeles       892 businesses    15% conversion    $32,800 revenue  │
│  │  🏢 Chicago           634 businesses    22% conversion    $28,400 revenue  │
│  │  🎸 Austin            423 businesses    25% conversion    $19,600 revenue  │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  [⚡ Bulk Scan]  [📊 Generate Report]  [⚙️ Configure Agents]                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🔍 Lead Finder Interface Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Lead Finder                                                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │ 🔍 Search Box                                                               │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  [🔍] "Bakery in Manhattan" or "Auto repairs in Austin"...    [Find Leads] │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │ 🍕 Tony's Pizza │    │ ☕ Green Cafe   │    │ 🔧 Auto Repair  │            │
│  │                 │    │                 │    │                 │            │
│  │ 📍 123 Main St  │    │ 📍 456 Oak Ave  │    │ 📍 789 Pine St  │            │
│  │ ⭐ 4.2 (89)     │    │ ⭐ 4.7 (156)    │    │ ⭐ 4.0 (67)     │            │
│  │ 🌐 No Website   │    │ 🌐 Has Website  │    │ 🌐 No Website   │            │
│  │                 │    │                 │    │                 │            │
│  │ 🏷️ Website      │    │ 🏷️ SEO Opt     │    │ 🏷️ Website      │            │
│  │ 🏷️ Digital Mkt  │    │ 🏷️ App Dev     │    │ 🏷️ Online Book  │            │
│  │                 │    │                 │    │                 │            │
│  │     [+ Save]    │    │     [✓ Saved]   │    │     [+ Save]    │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                        🌐 Sources Used by Gemini                           │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  [Google Maps: Tony's Pizzeria] [Yelp Reviews] [Business Directory]       │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 📄 Proposal Generation Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Digital Growth Proposal for Tony's Pizzeria                    [🖨️] [✨ Regen] │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                           🏢 BizGrow IT Solutions                          │
│  │                                                                             │
│  │  Digital Growth Proposal for Tony's Pizzeria                               │
│  │  ═══════════════════════════════════════════                               │
│  │                                                                             │
│  │  We've identified significant growth opportunities for your restaurant      │
│  │  business through strategic digital transformation initiatives.             │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │  01 Market Analysis & Gap                                                  │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  "Your restaurant has excellent reviews (4.2/5 stars) but lacks digital    │
│  │   presence. Competitors with websites see 40% more customers. Local food   │
│  │   delivery market growing 25% annually in your area."                      │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │  02 Growth Roadmap                                                         │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  │ 🌐 Website      │    │ 📱 Online Menu  │    │ 📊 Analytics    │        │
│  │  │ Creation        │    │ & Ordering      │    │ Dashboard       │        │
│  │  │                 │    │                 │    │                 │        │
│  │  │ Professional    │    │ Integrated      │    │ Customer        │        │
│  │  │ responsive      │    │ payment         │    │ insights &      │        │
│  │  │ design          │    │ processing      │    │ performance     │        │
│  │  │                 │    │                 │    │                 │        │
│  │  │ ✅ 300% more    │    │ ✅ 150% order   │    │ ✅ Data-driven  │        │
│  │  │ visibility      │    │ volume          │    │ decisions       │        │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │  Investment Strategy                                                        │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  Flexible payment options starting at $299/month. ROI typically seen       │
│  │  within 60 days. No upfront costs, cancel anytime.                         │
│  │                                                                             │
│  │                          [📧 Send to Tony's Pizzeria]                      │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 📊 Analytics Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Analytics & Performance                                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                          📈 Performance Overview                            │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  Discovery Rate: ████████████████████████████████████████████ 94%          │
│  │  Proposal Quality: ████████████████████████████████████████ 87%            │
│  │  Interest Rate: ████████████████████████████ 23%                           │
│  │  Conversion Rate: ████████████████ 12%                                     │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                          🗺️ Regional Heatmap                               │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │    [🔥🔥🔥] NYC        [🔥🔥] LA         [🔥🔥🔥] Chicago                   │
│  │     1,247 biz          892 biz          634 biz                            │
│  │     18% conv           15% conv          22% conv                           │
│  │                                                                             │
│  │    [🔥🔥🔥] Austin     [🔥] Miami        [🔥] Seattle                       │
│  │     423 biz            234 biz          156 biz                            │
│  │     25% conv           12% conv          19% conv                           │
│  │                                                                             │
│  └─────────────────────────────────────────────────────────────────────────────┘
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                          📊 Revenue Trends                                 │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  Monthly Revenue                                                            │
│  │  $50K ┤                                                                    │
│  │  $40K ┤     ●                                                              │
│  │  $30K ┤   ●   ●                                                            │
│  │  $20K ┤ ●       ●                                                          │
│  │  $10K ┤           ●                                                        │
│  │   $0K └─────────────────────────────────────────                          │
│       Jan Feb Mar Apr May Jun                                                 │
│                                                                               │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 📱 Mobile Responsive Design

### Mobile Dashboard (320px - 768px)
```
┌─────────────────────────┐
│ ☰ BizGrow AI        🔔 │
├─────────────────────────┤
│                         │
│ ┌─────────────────────┐ │
│ │   📊 Total Leads    │ │
│ │       1,247         │ │
│ │     (+12% ↗️)       │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │   🎯 Interested     │ │
│ │        23           │ │
│ │     (+8% ↗️)        │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │   💰 Revenue        │ │
│ │      $45.2K         │ │
│ │    (+15% ↗️)        │ │
│ └─────────────────────┘ │
│                         │
│ Recent Activity         │
│ ─────────────────────── │
│ 🍕 Tony's Pizza        │
│ 📍 NYC • ⭐ 4.2        │
│ 🌐 No Website [Pitch]  │
│                         │
│ ☕ Green Cafe          │
│ 📍 LA • ⭐ 4.7         │
│ 🌐 Has Site [Pitch]    │
│                         │
│ [🔍 Find More]         │
│                         │
└─────────────────────────┘
```

### Tablet Layout (768px - 1024px)
```
┌─────────────────────────────────────────────────────────────┐
│ BizGrow AI                                      🔔 ⚙️ 👤 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│ │ 📊 Leads    │  │ 🎯 Interest │  │ 💰 Revenue  │         │
│ │   1,247     │  │     23      │  │   $45.2K    │         │
│ │ (+12% ↗️)   │  │  (+8% ↗️)   │  │ (+15% ↗️)   │         │
│ └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│ Recent Leads                                                │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 🍕 Tony's Pizzeria    📞 (555) 123-4567    [Pitch]       │
│    123 Main St, NYC   ⭐ 4.2 • 🌐 No Website             │
│                                                             │
│ ☕ Green Leaf Cafe    📞 (555) 987-6543    [Pitch]       │
│    456 Oak Ave, LA    ⭐ 4.7 • 🌐 Has Website            │
│                                                             │
│ [🔍 Find More Leads]  [📊 Analytics]                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🎨 Component Library

### Button Styles
```css
/* Primary Button */
.btn-primary {
  background: #4f46e5;
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

/* Secondary Button */
.btn-secondary {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 12px 24px;
  border-radius: 12px;
}

/* Status Badges */
.badge-active {
  background: #10b981;
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
}

.badge-idle {
  background: #f59e0b;
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
}
```

### Card Components
```css
/* Main Card */
.card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Metric Card */
.metric-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px;
  text-align: center;
}

/* Agent Status Card */
.agent-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  transition: all 0.2s;
}

.agent-card:hover {
  border-color: #4f46e5;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.1);
}
```

## 🔄 Interactive States

### Loading States
```
┌─────────────────────────────────────┐
│ 🔄 Discovering businesses...       │
│ ████████████████████████████ 75%   │
│                                     │
│ Found 23 businesses in Austin, TX  │
│ Analyzing digital presence...       │
└─────────────────────────────────────┘
```

### Error States
```
┌─────────────────────────────────────┐
│ ❌ Connection Error                 │
│                                     │
│ Unable to connect to AI services.   │
│ Please check your internet         │
│ connection and try again.           │
│                                     │
│ [🔄 Retry] [📞 Support]            │
└─────────────────────────────────────┘
```

### Success States
```
┌─────────────────────────────────────┐
│ ✅ Proposal Sent Successfully!     │
│                                     │
│ Your proposal has been sent to      │
│ Tony's Pizzeria. We'll notify you  │
│ when they respond.                  │
│                                     │
│ [📊 View Analytics] [✉️ Send More] │
└─────────────────────────────────────┘
```

## 📐 Layout Grid System

### Desktop Grid (1200px+)
```
┌─────────────────────────────────────────────────────────────┐
│ [Sidebar 256px] [Main Content Flex-1] [Optional Panel]     │
│                                                             │
│ Navigation      Content Area           Contextual           │
│ - Dashboard     - Cards Grid           - Agent Status       │
│ - Lead Finder   - Data Tables          - Quick Actions     │
│ - Analytics     - Forms                - Notifications     │
│ - Settings      - Charts               - Help              │
└─────────────────────────────────────────────────────────────┘
```

### Responsive Breakpoints
```css
/* Mobile First Approach */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```